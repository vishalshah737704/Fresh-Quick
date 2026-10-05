import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOCOMPLETE_FIELD_MASK,
  DETAILS_FIELD_MASK,
  buildAutocompleteBody,
  buildPlaceDetailsUrl,
  buildReverseGeocodeUrl,
  normalizeCertSha1,
  parseAutocomplete,
  parsePlaceDetails,
  parseReverseGeocode,
} from "../mobile/lib/places-parse.ts";
import { reconcile, sameLocation } from "../mobile/lib/location-reconcile.ts";
import { toAddressFormFields } from "../mobile/lib/place.ts";

test("autocomplete body restricts to India and carries the session token", () => {
  assert.deepEqual(buildAutocompleteBody("indira", "tok1"), {
    input: "indira",
    sessionToken: "tok1",
    includedRegionCodes: ["in"],
  });
});

test("details url encodes the id; field masks name what the parsers read", () => {
  assert.equal(buildPlaceDetailsUrl("ChIJ a/b"), "https://places.googleapis.com/v1/places/ChIJ%20a%2Fb");
  assert.equal(DETAILS_FIELD_MASK, "displayName,formattedAddress,location,addressComponents");
  assert.match(AUTOCOMPLETE_FIELD_MASK, /placePrediction\.placeId/);
});

test("reverse geocode url has the latlng and never a key", () => {
  const url = buildReverseGeocodeUrl(12.9716, 77.5946);
  assert.equal(url, "https://maps.googleapis.com/maps/api/geocode/json?latlng=12.9716%2C77.5946");
  assert.doesNotMatch(url, /key=/);
});

test("autocomplete parsing uses structured text, skips query predictions and bad rows", () => {
  const r = parseAutocomplete({
    suggestions: [
      {
        placePrediction: {
          placeId: "p1",
          text: { text: "MG Road, Bengaluru, Karnataka, India" },
          structuredFormat: { mainText: { text: "MG Road" }, secondaryText: { text: "Bengaluru, Karnataka" } },
        },
      },
      { placePrediction: { placeId: "p2", text: { text: "Only full text" } } },
      { queryPrediction: { text: { text: "pizza" } } },
      { placePrediction: { text: { text: "no id" } } },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, [
    { placeId: "p1", text: "MG Road", secondaryText: "Bengaluru, Karnataka" },
    { placeId: "p2", text: "Only full text", secondaryText: "" },
  ]);
});

test("autocomplete parsing: empty object is no suggestions, junk is bad_response", () => {
  assert.deepEqual(parseAutocomplete({}), { ok: true, value: [] });
  assert.deepEqual(parseAutocomplete(null), { ok: false, kind: "bad_response" });
  assert.deepEqual(parseAutocomplete({ suggestions: "x" }), { ok: false, kind: "bad_response" });
});

test("details parsing returns coordinates and Places (New) components usable by place.ts", () => {
  const r = parsePlaceDetails({
    displayName: { text: "Cubbon Park" },
    formattedAddress: "Kasturba Rd, Bengaluru, Karnataka 560001, India",
    location: { latitude: 12.9763, longitude: 77.5929 },
    addressComponents: [
      { longText: "Bengaluru", shortText: "Bengaluru", types: ["locality", "political"] },
      { longText: "Karnataka", shortText: "KA", types: ["administrative_area_level_1"] },
      { longText: "560001", shortText: "560001", types: ["postal_code"] },
      { bogus: true },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.lat, 12.9763);
  assert.equal(r.value.lng, 77.5929);
  assert.equal(r.value.displayName, "Cubbon Park");
  assert.equal(r.value.components.length, 3);
  const f = toAddressFormFields(r.value.components);
  assert.equal(f.city, "Bengaluru");
  assert.equal(f.state, "Karnataka");
  assert.equal(f.pincode, "560001");
});

test("details parsing rejects missing or non-finite coordinates", () => {
  assert.deepEqual(parsePlaceDetails({}), { ok: false, kind: "bad_response" });
  assert.deepEqual(parsePlaceDetails({ location: { latitude: "1", longitude: 2 } }), { ok: false, kind: "bad_response" });
  assert.deepEqual(parsePlaceDetails({ location: { latitude: NaN, longitude: 2 } }), { ok: false, kind: "bad_response" });
});

test("reverse geocode parsing: OK takes the first result", () => {
  const r = parseReverseGeocode({
    status: "OK",
    results: [
      {
        formatted_address: "12 MG Road, Bengaluru 560001, India",
        address_components: [{ long_name: "Bengaluru", short_name: "Bengaluru", types: ["locality"] }],
      },
      { formatted_address: "second" },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.formattedAddress, "12 MG Road, Bengaluru 560001, India");
  assert.equal(toAddressFormFields(r.value.components).city, "Bengaluru");
});

test("reverse geocode parsing: error statuses map to typed kinds", () => {
  assert.deepEqual(parseReverseGeocode({ status: "ZERO_RESULTS", results: [] }), { ok: false, kind: "no_results" });
  assert.deepEqual(parseReverseGeocode({ status: "REQUEST_DENIED" }), { ok: false, kind: "denied" });
  assert.deepEqual(parseReverseGeocode({ status: "OVER_QUERY_LIMIT" }), { ok: false, kind: "denied" });
  assert.deepEqual(parseReverseGeocode({ status: "UNKNOWN_ERROR" }), { ok: false, kind: "bad_response" });
  assert.deepEqual(parseReverseGeocode({ status: "OK", results: [] }), { ok: false, kind: "no_results" });
  assert.deepEqual(parseReverseGeocode("x"), { ok: false, kind: "bad_response" });
});

test("cert sha1 is normalised to uppercase hex without colons", () => {
  assert.equal(normalizeCertSha1("5e:8f:16:06"), "5E8F1606");
  assert.equal(normalizeCertSha1("5E8F1606"), "5E8F1606");
});

const A = { lat: 12.9, lng: 77.5, label: "A" };
const B = { lat: 19.07, lng: 72.87, label: "B" };

test("reconcile: empty cache uses the server value and pushes nothing", () => {
  assert.deepEqual(reconcile(null, false, B), { use: B, pushToServer: false });
  assert.deepEqual(reconcile(null, true, null), { use: null, pushToServer: false });
});

test("reconcile: dirty cache wins and is pushed when the server is empty or differs", () => {
  assert.deepEqual(reconcile(A, true, null), { use: A, pushToServer: true });
  assert.deepEqual(reconcile(A, true, B), { use: A, pushToServer: true });
});

test("reconcile: clean cache yields to the server, including an empty server", () => {
  assert.deepEqual(reconcile(A, false, B), { use: B, pushToServer: false });
  assert.deepEqual(reconcile(A, false, null), { use: null, pushToServer: false });
});

test("reconcile: identical dirty cache and server push nothing", () => {
  assert.deepEqual(reconcile(A, true, { ...A }), { use: A, pushToServer: false });
  assert.equal(sameLocation(A, { ...A, label: "other" }), false);
  assert.equal(sameLocation(null, null), true);
});
