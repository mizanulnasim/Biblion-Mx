// Where this phone is, for punching and for setting the shop's position.
// Resolves to {lat, lng, accuracy} or null when location is off, refused or
// takes too long; the server decides whether a punch needs it.

const TIMEOUT_MS = 15000;

export function currentPlace() {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
    );
  });
}
