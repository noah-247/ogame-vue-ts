import type { Planet, Player } from '@/types/game'

type JsonFixture<Schema> = Schema extends string ? string
  : Schema extends (infer Item)[] ? JsonFixture<Item>[]
  : Schema extends object ? { [Key in keyof Schema]: JsonFixture<Schema[Key]> }
  : Schema

type FixturePlanet = Omit<JsonFixture<Planet>, 'buildings' | 'fleet' | 'defense'> & {
  buildings: Partial<Planet['buildings']>
  fleet: Partial<Planet['fleet']>
  defense: Partial<Planet['defense']>
}

export type FixturePlayer = Omit<JsonFixture<Player>, 'planets' | 'technologies' | 'officers'> & {
  planets: FixturePlanet[]
  technologies: Partial<Player['technologies']>
  officers: Partial<JsonFixture<Player['officers']>>
} & Required<Pick<JsonFixture<Player>, 'achievementStats' | 'achievements'>>
