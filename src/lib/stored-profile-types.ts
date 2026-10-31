/** Fields shared by current profiles and legacy users rows. */
export interface StoredProfile extends Record<string, unknown> {
  id?: string;
  email?: string | null;
  name?: string | null;
  birth_month?: string | number | null;
  birth_day?: string | number | null;
  birth_year?: string | number | null;
  birth_hour?: string | number | null;
  birth_minute?: string | number | null;
  birth_period?: string | null;
  birth_place?: string | null;
  knows_birth_time?: boolean | null;
  gender?: string | null;
  relationship_status?: string | null;
  goals?: string[] | null;
  color_preference?: string | null;
  element_preference?: string | null;
  sun_sign?: string | { name: string } | null;
  moon_sign?: string | { name: string } | null;
  ascendant_sign?: string | { name: string } | null;
}
