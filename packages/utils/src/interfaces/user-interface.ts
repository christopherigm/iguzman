export interface BaseUser {
  type: string;
  id: string;
}

export interface BaseUserAttributes {
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
  img_picture?: string;
  theme?: string;
  theme_color?: string;
  profile_picture_shape?: string;
  phone_number?: string;
}
