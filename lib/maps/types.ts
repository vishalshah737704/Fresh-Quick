// Minimal local declarations for the parts of the Google Maps JavaScript API
// this app uses (no @types/google.maps). Library names: Map and Polyline are in
// "maps", LatLngBounds and SymbolPath in "core", the classic google.maps.Marker
// in "marker". Marker choice: the classic Marker, because AdvancedMarkerElement
// requires a cloud Map ID which this project does not configure.

export type LatLngLiteral = { lat: number; lng: number };

export type MapsEventListener = { remove(): void };

export type MapOptions = {
  center?: LatLngLiteral;
  zoom?: number;
  disableDefaultUI?: boolean;
  zoomControl?: boolean;
  mapTypeControl?: boolean;
  streetViewControl?: boolean;
  fullscreenControl?: boolean;
  gestureHandling?: string;
};

export type GLatLngBounds = {
  extend(p: LatLngLiteral): GLatLngBounds;
  isEmpty(): boolean;
};

export type GMap = {
  setCenter(c: LatLngLiteral): void;
  setZoom(z: number): void;
  panTo(c: LatLngLiteral): void;
  fitBounds(
    b: GLatLngBounds,
    padding?: number | { top: number; right: number; bottom: number; left: number }
  ): void;
  addListener(event: string, handler: (...args: any[]) => void): MapsEventListener;
};

export type MarkerOptions = {
  map?: GMap | null;
  position?: LatLngLiteral;
  draggable?: boolean;
  title?: string;
  label?: string | { text: string; color?: string; fontWeight?: string };
  icon?: unknown;
  zIndex?: number;
};

export type GMarker = {
  setMap(map: GMap | null): void;
  setPosition(p: LatLngLiteral): void;
  getPosition(): { lat(): number; lng(): number } | null | undefined;
  setDraggable(d: boolean): void;
  addListener(event: string, handler: (...args: any[]) => void): MapsEventListener;
};

export type PolylineOptions = {
  map?: GMap | null;
  path?: LatLngLiteral[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  icons?: unknown[];
  geodesic?: boolean;
};

export type GPolyline = {
  setMap(map: GMap | null): void;
  setPath(path: LatLngLiteral[]): void;
};

export type GeocoderAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type GeocoderResult = {
  formatted_address: string;
  address_components: GeocoderAddressComponent[];
  geometry: { location: { lat(): number; lng(): number } };
};

export type GGeocoder = {
  geocode(request: {
    location?: LatLngLiteral;
    address?: string;
    region?: string;
  }): Promise<{ results: GeocoderResult[] }>;
};

export type PlaceResult = {
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat(): number; lng(): number } | null;
  addressComponents?: { longText?: string; shortText?: string; types: string[] }[] | null;
  fetchFields(request: { fields: string[] }): Promise<unknown>;
};

export type PlaceAutocompleteElementOptions = {
  includedRegionCodes?: string[];
  locationBias?: unknown;
  placeholder?: string;
};

// A web component, so also an HTMLElement. "gmp-select" delivers a placePrediction.
export type GPlaceAutocompleteElement = HTMLElement & {
  addEventListener(
    type: "gmp-select",
    listener: (event: { placePrediction: { toPlace(): PlaceResult } }) => void
  ): void;
  addEventListener(type: "gmp-error", listener: (event: Event) => void): void;
};

// google.maps.routes.Route: computeRoutes is static. Each returned route has
// path (LatLng or LatLngAltitude items), durationMillis and distanceMeters when
// requested in `fields`; the result is validated by parseRoute, hence unknown.
export type RouteComputeRequest = {
  origin: LatLngLiteral;
  destination: LatLngLiteral;
  travelMode: string;
  routingPreference?: string;
  fields: string[];
};

export type RouteClass = {
  computeRoutes(request: RouteComputeRequest): Promise<{ routes: unknown[] }>;
};

export type GoogleNs = {
  maps: {
    importLibrary(name: "routes"): Promise<{ Route?: RouteClass } & Record<string, unknown>>;
    routes?: { Route?: RouteClass };
    importLibrary(name: "maps"): Promise<{
      Map: new (el: HTMLElement, opts?: MapOptions) => GMap;
      Polyline: new (opts?: PolylineOptions) => GPolyline;
    }>;
    // LatLngBounds, LatLng and SymbolPath live in the "core" library, not "maps".
    importLibrary(name: "core"): Promise<{
      LatLngBounds?: new () => GLatLngBounds;
      SymbolPath?: { CIRCLE: number };
    } & Record<string, unknown>>;
    // The legacy google.maps.Marker lives in the "marker" library, not "maps".
    importLibrary(name: "marker"): Promise<{
      Marker?: new (opts?: MarkerOptions) => GMarker;
    } & Record<string, unknown>>;
    importLibrary(name: "geocoding"): Promise<{ Geocoder: new () => GGeocoder }>;
    importLibrary(name: "places"): Promise<{
      PlaceAutocompleteElement: new (
        opts?: PlaceAutocompleteElementOptions
      ) => GPlaceAutocompleteElement;
    }>;
    Marker?: new (opts?: MarkerOptions) => GMarker;
    Polyline?: new (opts?: PolylineOptions) => GPolyline;
    LatLngBounds?: new () => GLatLngBounds;
    SymbolPath?: { CIRCLE: number };
    event: { removeListener(l: MapsEventListener): void };
  };
};

export type MapsErrorKind = "missing_key" | "load_failed" | "auth_failed";

export type MapsStatus =
  | { status: "loading"; error?: undefined }
  | { status: "ready"; error?: undefined }
  | { status: "error"; error: MapsErrorKind };
