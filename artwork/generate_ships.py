import sys, time, json, os
from playwright.sync_api import sync_playwright

ART = ("Deep-space black background (#03050c) with lavender-purple (#bf9cff) glowing accents. "
       "Realistic sci-fi concept art, single centered subject, clean recognizable silhouette, "
       "no text, no watermark, cinematic rim lighting. Square format.")

KEYS = [
    ("lightFighter", "small delta-wing single-seat fighter, short compact fuselage, light gray hull"),
    ("heavyFighter", "bulky twin-engine armored fighter, forward-swept wings, dark metal hull"),
    ("cruiser", "long arrowhead-shaped fast frigate, glowing engine bar at stern"),
    ("battleship", "elongated heavily-armored warship, command bridge tower, layered deck structures"),
    ("battlecruiser", "stocky gunship with protruding side turret pods, glowing rear engines"),
    ("bomber", "fat bulbous bomber hull, glowing engine slit at bow, heavy dark armor"),
    ("destroyer", "long lance-like dreadnought, huge spinal cannon protruding forward"),
    ("smallCargo", "small rounded cargo shuttle, bulbous cockpit, side engine pods"),
    ("largeCargo", "large armored freighter, segmented container hull, rear bridge superstructure"),
    ("colonyShip", "massive ark colony ship, glowing green dome on top"),
    ("recycler", "squat salvage tug with front claw arms, floating debris around"),
    ("espionageProbe", "tiny spiky spherical drone, thin antenna spikes"),
    ("solarSatellite", "classic satellite with four solar panel wings, central truss"),
    ("darkMatterHarvester", "dark-hulled harvester ship, glowing violet containment pods, claw collectors"),
    ("deathstar", "colossal spherical gray battlestation, moon-sized, crater dish on surface"),
]

OUTDIR = os.path.expanduser("~/workspace/ogame-analysis/public/images/ships")
MANIFEST = os.path.expanduser("~/workspace/ogame-analysis/artwork/manifest.json")
os.makedirs(OUTDIR, exist_ok=True)

def load_manifest():
    if os.path.exists(MANIFEST):
        try:
            return json.load(open(MANIFEST))
        except Exception:
            pass
    return {"ships": []}

def save_manifest(m):
    json.dump(m, open(MANIFEST, "w"), ensure_ascii=False, indent=2)

def prompt_for(key_en):
    return f"{key_en}. {ART}"

def generating(pg):
    """True while ChatGPT is generating (Stop button visible in composer)."""
    return pg.evaluate("""() => [...document.querySelectorAll('button')]
      .some(b => /^stop$/i.test((b.getAttribute('aria-label')||'').trim())
             && (b.offsetWidth || b.getClientRects().length))""")

def last_gen_image_src(pg):
    return pg.evaluate("""() => {
      const imgs = [...document.querySelectorAll('img')].filter(i => (i.alt||'').includes('Generated image'));
      return imgs.length ? imgs[imgs.length-1].src : null;
    }""")

def composer_text(pg):
    return pg.evaluate("""() => {
      const els = [...document.querySelectorAll('div.ProseMirror[contenteditable="true"]')];
      const el = els.find(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      return el ? el.innerText : '';
    }""")

def user_msgs(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('div[class*="user-message"]')]
      .filter(d => (d.innerText||'').trim().length > 50)
      .map(d => d.innerText)""")

def last_user_msg(pg):
    ms = user_msgs(pg)
    return ms[-1] if ms else ''

def page_error(pg):
    t = pg.evaluate("() => document.body.innerText.slice(-1200)")
    return ("went wrong" in t) or ("error" in t.lower() and "image" in t.lower())

def is_cdp_error(e):
    s = str(e).lower()
    return any(x in s for x in ["targetclosed", "has been closed", "econnrefused",
                                "connection closed", "browser has been closed",
                                "target crashed", "websocket"])

def connect():
    p = sync_playwright().start()
    browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")
    pg = None
    for ctx in browser.contexts:
        for x in ctx.pages:
            if "chatgpt.com" in x.url:
                pg = x
                break
    if not pg:
        p.stop()
        raise RuntimeError("NO_CHATGPT_PAGE")
    return p, browser, pg

def paste_prompt(pg, text):
    pasted = pg.evaluate("""(t) => {
      const els = [...document.querySelectorAll('div.ProseMirror[contenteditable="true"]')];
      const el = els.find(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      if (!el) return 'no_visible_composer';
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, t);
      return 'ok:' + el.innerText.length;
    }""", text)
    time.sleep(1)
    cur_len = pg.evaluate("""() => {
      const els = [...document.querySelectorAll('div.ProseMirror[contenteditable="true"]')];
      const el = els.find(e => e.offsetWidth || e.offsetHeight || e.getClientRects().length);
      return el ? el.innerText.length : -1;
    }""")
    print("PASTE_RESULT", pasted, "len=", cur_len, flush=True)
    return pasted == f"ok:{cur_len}" and cur_len >= 50

def send_prompt(pg):
    box = pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('button')]
        .filter(x => (x.getAttribute('aria-label')||'').toLowerCase() === 'send'
          && (x.offsetWidth || x.getClientRects().length));
      const b = btns[btns.length-1];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return {x: r.x + r.width/2, y: r.y + r.height/2};
    }""")
    if box:
        pg.mouse.click(box['x'], box['y'])
        print("SEND_VIA mouse", flush=True)
    else:
        pg.keyboard.press("Enter")
        print("SEND_VIA enter(fallback)", flush=True)

def our_image_src(pg, key_en):
    """Last 'Generated image' that appears in DOM *after* our user message.
    Only meaningful when not generating (during generation it may be a placeholder)."""
    return pg.evaluate("""(keyStart) => {
      const users = [...document.querySelectorAll('div[class*="user-message"]')]
        .filter(d => (d.innerText||'').trim().length > 50);
      const umsg = users.length ? users[users.length-1] : null;
      if (!umsg || !(umsg.innerText||'').includes(keyStart)) return null;
      const imgs = [...document.querySelectorAll('img')]
        .filter(i => (i.alt||'').includes('Generated image'));
      for (let i = imgs.length - 1; i >= 0; i--) {
        if (umsg.compareDocumentPosition(imgs[i]) & 4) return imgs[i].src;
      }
      return null;
    }""", key_en[:40])

def wait_not_generating(pg, timeout=600):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not generating(pg):
            time.sleep(4)
            if not generating(pg):
                return True
        time.sleep(8)
    return False

def download_image(pg, src):
    data = pg.evaluate("""(s) => (async () => {
      const r = await fetch(s);
      return Array.from(new Uint8Array(await r.arrayBuffer()));
    })()""", src)
    raw = bytes(data)
    if (raw[:8] == b"\x89PNG\r\n\x1a\n" or raw[:2] == b"\xff\xd8") and len(raw) > 100_000:
        return raw
    print(f"BAD_MAGIC {raw[:8]!r} len={len(raw)}", flush=True)
    return None

def main():
    manifest = load_manifest()
    done = set(manifest.get("ships", []))
    # reconcile with files on disk
    for f in os.listdir(OUTDIR):
        if f.endswith(".png"):
            done.add(f[:-4])
    manifest["ships"] = sorted(done)
    save_manifest(manifest)
    print(f"DONE={sorted(done)}", flush=True)

    p, browser, pg = connect()
    pg.bring_to_front()
    time.sleep(1)

    def do_reconnect():
        nonlocal p, browser, pg
        try:
            p.stop()
        except Exception:
            pass
        for _ in range(6):
            try:
                p, browser, pg = connect()
                pg.bring_to_front()
                pg.evaluate("() => 1")
                print("RECONNECTED", flush=True)
                return True
            except Exception as e2:
                print(f"reconnect failed: {str(e2)[:100]}", flush=True)
                time.sleep(20)
        return False

    for key, key_en in KEYS:
        if key in done and os.path.exists(f"{OUTDIR}/{key}.png"):
            continue
        text = prompt_for(key_en)
        ok = False
        for attempt in range(1, 4):
            print(f"=== {key} attempt {attempt} ===", flush=True)
            # liveness check + reconnect if needed
            alive = True
            try:
                pg.bring_to_front()
                pg.evaluate("() => 1")
            except Exception as e:
                print(f"CDP_DROP: {str(e)[:120]}", flush=True)
                alive = False
            if not alive:
                time.sleep(10)
                if not do_reconnect():
                    print("CDP unrecoverable, aborting run", flush=True)
                    save_manifest(manifest)
                    return
            try:
                # decide whether we actually need to paste+send
                in_flight = generating(pg)
                comp = composer_text(pg)
                lastu = last_user_msg(pg)
                need_send = True
                if in_flight:
                    need_send = False
                    print(f"{key}: generation in flight, skipping send", flush=True)
                elif len(comp.strip()) > 50:
                    print(f"{key}: composer holds unsent text, sending", flush=True)
                elif lastu and key_en[:40] in lastu:
                    need_send = False
                    print(f"{key}: prompt already sent, waiting for completion", flush=True)
                if need_send:
                    if not paste_prompt(pg, text):
                        print("PASTE_VERIFY_FAIL", flush=True)
                        pg.screenshot(path=f"/tmp/og_ships_pastefail_{key}.png")
                        continue
                    send_prompt(pg)
                    print("SENT, waiting for image...", flush=True)
                    # wait for generation to start
                    t0 = time.time()
                    started = False
                    while time.time() - t0 < 180:
                        if generating(pg):
                            started = True
                            break
                        if page_error(pg):
                            break
                        time.sleep(5)
                    if not started and not our_image_src(pg, key_en):
                        print(f"{key}: generation never started (or errored)", flush=True)
                        pg.screenshot(path=f"/tmp/og_ships_nostart_{key}.png")
                        continue
                # wait for generation to finish, then take the image after our message
                if not wait_not_generating(pg):
                    print(f"{key}: TIMEOUT waiting for generation to finish", flush=True)
                    pg.screenshot(path=f"/tmp/og_ships_timeout_{key}.png")
                    continue
                newsrc = our_image_src(pg, key_en)
                if not newsrc:
                    print(f"{key}: no image found after our message", flush=True)
                    pg.screenshot(path=f"/tmp/og_ships_noimg_{key}.png")
                    continue
                raw = download_image(pg, newsrc)
                if raw:
                    out = f"{OUTDIR}/{key}.png"
                    open(out, "wb").write(raw)
                    print(f"{key}: SAVED {len(raw)} bytes", flush=True)
                    done.add(key)
                    manifest["ships"] = sorted(done)
                    save_manifest(manifest)
                    ok = True
                    break
                else:
                    print(f"{key}: download failed, retrying", flush=True)
            except Exception as e:
                if is_cdp_error(e):
                    print(f"{key}: CDP_DROP mid-attempt ({str(e)[:100]}), retrying", flush=True)
                    time.sleep(15)
                    continue
                raise
        if not ok:
            fails = manifest.get("failed", {})
            fails[key] = "failed after 3 attempts"
            manifest["failed"] = fails
            save_manifest(manifest)
        time.sleep(5)
    print("ALL_DONE", sorted(done), flush=True)
    pg.screenshot(path="/tmp/og_ships_final.png")

main()
