import test from "node:test";
import assert from "node:assert/strict";
import { parseAddressComponents, placeLabel, isValidLatLng } from "../lib/maps/place.ts";

const c = (long, ...types) => ({ long_name: long, short_name: long, types });

test("street number + route, locality, state, pincode", () => {
  const out = parseAddressComponents([
    c("12", "street_number"),
    c("MG Road", "route"),
    c("Indiranagar", "sublocality_level_1", "sublocality"),
    c("Bengaluru", "locality"),
    c("Karnataka", "administrative_area_level_1"),
    c("560038", "postal_code"),
  ]);
  assert.deepEqual(out, { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", pincode: "560038" });
});

test("India variant: premise + route + sublocality", () => {
  const out = parseAddressComponents([
    c("Orchid Heights", "premise"),
    c("Linking Road", "route"),
    c("Bandra West", "sublocality_level_1", "sublocality"),
    c("Mumbai", "locality"),
    c("Maharashtra", "administrative_area_level_1"),
    c("400050", "postal_code"),
  ]);
  assert.equal(out.line1, "Orchid Heights, Linking Road");
  assert.equal(out.city, "Mumbai");
});

test("subpremise comes first and is not duplicated", () => {
  const out = parseAddressComponents([
    c("4B", "subpremise"),
    c("Sea View", "premise"),
    c("Pali Hill", "route"),
  ]);
  assert.equal(out.line1, "4B, Sea View, Pali Hill");
  const only = parseAddressComponents([c("4B", "subpremise")]);
  assert.equal(only.line1, "4B");
});

test("premise without a street falls back to adding the sublocality", () => {
  const out = parseAddressComponents([
    c("Tower 3", "premise"),
    c("Powai", "sublocality_level_2", "sublocality"),
  ]);
  assert.equal(out.line1, "Tower 3, Powai");
});

test("only a locality area: sublocality becomes line1, city from locality", () => {
  const out = parseAddressComponents([
    c("Koramangala", "sublocality_level_1", "sublocality"),
    c("Bengaluru", "locality"),
  ]);
  assert.equal(out.line1, "Koramangala");
  assert.equal(out.city, "Bengaluru");
});

test("sublocality_level_2 is preferred over level_1", () => {
  const out = parseAddressComponents([
    c("Outer", "sublocality_level_1"),
    c("Inner", "sublocality_level_2"),
  ]);
  assert.equal(out.line1, "Inner");
});

test("city falls back to district when no locality", () => {
  const out = parseAddressComponents([c("Pune", "administrative_area_level_2"), c("Maharashtra", "administrative_area_level_1")]);
  assert.equal(out.city, "Pune");
  const town = parseAddressComponents([c("Slough", "postal_town"), c("Berkshire", "administrative_area_level_2")]);
  assert.equal(town.city, "Slough");
});

test("missing parts give empty strings, never undefined", () => {
  assert.deepEqual(parseAddressComponents([]), { line1: "", city: "", state: "", pincode: "" });
  assert.deepEqual(parseAddressComponents(null), { line1: "", city: "", state: "", pincode: "" });
  assert.deepEqual(parseAddressComponents(undefined), { line1: "", city: "", state: "", pincode: "" });
  assert.deepEqual(parseAddressComponents([c("  ", "locality")]).city, "");
});

test("Places (New) longText components are understood", () => {
  const out = parseAddressComponents([
    { longText: "Delhi", shortText: "DL", types: ["administrative_area_level_1"] },
    { longText: "110001", shortText: "110001", types: ["postal_code"] },
  ]);
  assert.equal(out.state, "Delhi");
  assert.equal(out.pincode, "110001");
});

test("placeLabel prefers the name, adds the city when it is missing", () => {
  assert.equal(
    placeLabel({ name: "Phoenix Mall", components: [c("Mumbai", "locality")] }),
    "Phoenix Mall, Mumbai"
  );
  assert.equal(placeLabel({ displayName: "Mumbai Central", components: [c("Mumbai", "locality")] }), "Mumbai Central");
});

test("placeLabel uses the first two parts of a formatted address", () => {
  assert.equal(
    placeLabel({ formatted_address: "12 MG Road, Indiranagar, Bengaluru, Karnataka 560038, India" }),
    "12 MG Road, Indiranagar"
  );
});

test("placeLabel falls back to parsed parts, then coordinates, then empty", () => {
  assert.equal(
    placeLabel({ components: [c("Powai", "sublocality"), c("Mumbai", "locality")] }),
    "Powai, Mumbai"
  );
  assert.equal(placeLabel({ lat: 19.07612, lng: 72.87771 }), "19.0761, 72.8777");
  assert.equal(placeLabel({}), "");
  assert.equal(placeLabel(null), "");
  assert.equal(placeLabel({ lat: 999, lng: 0 }), "");
});

test("isValidLatLng", () => {
  assert.equal(isValidLatLng(19.07, 72.87), true);
  assert.equal(isValidLatLng(0, 0), true);
  assert.equal(isValidLatLng(90, 180), true);
  assert.equal(isValidLatLng(-90, -180), true);
  assert.equal(isValidLatLng(91, 0), false);
  assert.equal(isValidLatLng(0, 181), false);
  assert.equal(isValidLatLng(NaN, 0), false);
  assert.equal(isValidLatLng(Infinity, 0), false);
  assert.equal(isValidLatLng("19", "72"), false);
  assert.equal(isValidLatLng(null, undefined), false);
});
