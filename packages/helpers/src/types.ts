/* ------------------------------------------------------------------ */
/*  Language                                                          */
/* ------------------------------------------------------------------ */

/** Supported application language codes. */
export type Language = 'en' | 'es';

/* ------------------------------------------------------------------ */
/*  API Errors                                                        */
/* ------------------------------------------------------------------ */

/** Flattened API error returned after processing a resource creation request. */
export interface ApiPostCreationError {
  /** Human-readable description of the error. */
  detail: string;
  /** HTTP status code. */
  status: number;
  /** JSON pointer to the field that caused the error. */
  pointer: string;
  /** Machine-readable error code. */
  code: string;
}

/** Raw error shape received from the API during resource creation. */
export interface CreationErrorInput {
  /** Human-readable description of the error. */
  detail: string;
  /** HTTP status code (numeric or stringified). */
  status: number | string;
  /** Source location of the error. */
  source: {
    /** JSON pointer to the field that caused the error. */
    pointer: string;
  };
  /** Machine-readable error code. */
  code: string;
}

/** General-purpose API error. */
export interface ApiError {
  /** Human-readable description of the error (may be absent on generic errors). */
  detail?: string;
  /** Short error message. */
  message: string;
  /** Machine-readable error code. */
  code: string;
  /** HTTP status code. */
  status: number;
  /** Source location of the error, when available. */
  source?: {
    /** JSON pointer to the field that caused the error. */
    pointer: string;
  };
}

/* ------------------------------------------------------------------ */
/*  JSON:API                                                          */
/* ------------------------------------------------------------------ */

/** Common envelope for paginated JSON:API array responses. */
export interface JsonApiArrayResponse {
  /** Pagination navigation links. */
  links: {
    /** URL of the first page. */
    first: string;
    /** URL of the last page. */
    last: string;
    /** URL of the next page, or `null` when on the last page. */
    next: string | null;
    /** URL of the previous page, or `null` when on the first page. */
    prev: string | null;
  };
  /** Response metadata. */
  meta: {
    /** Pagination counters. */
    pagination: {
      /** Current page number (1-based). */
      page: number;
      /** Total number of pages. */
      pages: number;
      /** Total number of records across all pages. */
      count: number;
    };
  };
}

/* ------------------------------------------------------------------ */
/*  Geography                                                         */
/* ------------------------------------------------------------------ */

/** JSON:API resource representing a country. */
export interface Country {
  id: number;
  type: 'Country';
  attributes: {
    /** Country display name. */
    name: string;
    /** ISO country code (e.g. `"US"`, `"MX"`). */
    code: string;
    /** International dialling code (e.g. `"+1"`). */
    phone_code: string;
    /** URL or path to the country's flag image. */
    img_flag: string;
  };
}

/** JSON:API resource representing a state or province. */
export interface State {
  id: number;
  type: 'State';
  attributes: {
    /** State / province display name. */
    name: string;
  };
  relationships: {
    country: {
      data: Country | null;
    };
  };
}

/** JSON:API resource representing a city. */
export interface City {
  id: number;
  type: 'City';
  attributes: {
    /** City display name. */
    name: string;
  };
  relationships: {
    state: {
      data: State | null;
    };
  };
}

/* ------------------------------------------------------------------ */
/*  Media                                                             */
/* ------------------------------------------------------------------ */

/** Base attributes shared by picture resources. */
export interface BasePictureAttributes {
  /** Display name. */
  name: string;
  /** Textual description / alt text. */
  description: string;
  /** Canonical URL the picture links to. */
  href: string;
  /** URL of the full-size image. */
  full_size: string;
  /** URL of the display-size image. */
  img_picture: string;
}

/* ------------------------------------------------------------------ */
/*  Authentication                                                    */
/* ------------------------------------------------------------------ */

/** Decoded JWT token payload with custom user claims. */
export interface JwtPayload {
  /** Token expiration timestamp (Unix seconds). */
  exp: number;
  /** Token issued-at timestamp (Unix seconds). */
  iat: number;
  /** Unique token identifier. */
  jti: string;
  /** Token type discriminator (e.g. `"access"`, `"refresh"`). */
  token_type: string;
  /** Encoded access token. */
  access: string;
  /** Encoded refresh token. */
  refresh: string;
  /** User ID. */
  id: string;
  /** Whether the user has staff / admin privileges. */
  is_staff: boolean;
  /** User's first name. */
  first_name: string;
  /** User's last name. */
  last_name: string;
}

/* ------------------------------------------------------------------ */
/*  Environment & System                                              */
/* ------------------------------------------------------------------ */

/** Application environment variables and runtime configuration. */
export interface EnvironmentVariables {
  host?: string;
  hostName?: string;
  URLBase?: string;
  K8sURLBase?: string;
  domainURL?: string;
  redisURL?: string;
  defaultLanguage?: string;
  logo?: string;
  logoWidth?: number;
  navBarBGColor?: string;
  darkNavBar?: boolean;
  footerBGColor?: string;
  darkFooter?: boolean;
  loginEnabled?: boolean;
  cartEnabled?: boolean;
  favoritesEnabled?: boolean;
  ordersEnabled?: boolean;
  searchEnabled?: boolean;
  version?: string;
  favicon?: string;
  /** Open Graph title for social previews. */
  ogTitle?: string;
  /** Open Graph site name. */
  ogSite?: string;
  /** Open Graph preview image URL. */
  ogImg?: string;
  /** Open Graph canonical URL. */
  ogURL?: string;
  /** Open Graph description. */
  ogDescription?: string;
  language?: Language;
  themeColor?: string;
  bodyBGColor?: string;
  github?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  topPadding?: boolean;
  bottomPadding?: boolean;
}

/** Cached runtime values (environment configuration + dev mode flag). */
export interface CachedValues extends EnvironmentVariables {
  /** Whether the application is running in development mode. */
  devMode?: boolean;
}

/** Full system state including routing paths and loading indicator. */
export interface System extends EnvironmentVariables {
  /** Known route paths registered in the application. */
  paths: string[];
  /** Whether the system is currently loading or initialising. */
  isLoading?: boolean;
}

/** Setter function for updating the {@link System} state. */
export type SetSystemFn = (system: Partial<System>) => void;

/* ------------------------------------------------------------------ */
/*  Component Props                                                   */
/* ------------------------------------------------------------------ */

/** Props for the meta-tags component. */
export interface MetaTagsProps extends EnvironmentVariables {
  /** Component children to render inside the meta-tags provider. */
  children?: unknown;
}

/* ------------------------------------------------------------------ */
/*  Utility Callbacks                                                 */
/* ------------------------------------------------------------------ */

/** Generic callback that receives data of type {@link T} and returns nothing. */
export type VoidCallback<T> = (data: T) => void;

/* ------------------------------------------------------------------ */
/*  Login Response                                                    */
/* ------------------------------------------------------------------ */

/** Response shape from the login API endpoint. */
export type LoginResponse = {
  access: string;
  refresh: string;
};

export type MUISizes = {
  xs?: number | string;
  sm?: number | string;
  md?: number | string;
  lg?: number | string;
};
