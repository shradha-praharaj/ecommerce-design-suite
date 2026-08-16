/**
 * Google Maps JavaScript SDK & Places API Loader
 */
let googleMapsPromise: Promise<boolean> | null = null;

export function getGoogleMapsApiKey(): string {
  return (
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    (window as any).__GOOGLE_MAPS_KEY__ ||
    ''
  );
}

export function loadGoogleMapsScript(apiKey?: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as any).google?.maps?.places) return Promise.resolve(true);

  const key = apiKey || getGoogleMapsApiKey();
  if (!key) {
    return Promise.resolve(false);
  }

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve) => {
    // Check if script element already exists
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      key,
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve(true);
    };
    script.onerror = (err) => {
      console.warn('Google Maps script failed to load:', err);
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  formattedAddress?: string;
}

/**
 * Extracts structured address parts from a Google Maps PlaceResult or GeocoderResult
 */
export function extractAddressComponents(
  components: Array<{ types: string[]; long_name: string; short_name: string }>,
  formattedAddress?: string,
): ParsedAddress {
  let streetNumber = '';
  let route = '';
  let sublocality = '';
  let city = '';
  let state = '';
  let zip = '';
  let country = '';

  for (const component of components) {
    const types = component.types;
    if (types.includes('street_number')) {
      streetNumber = component.long_name;
    } else if (types.includes('route')) {
      route = component.long_name;
    } else if (
      types.includes('sublocality') ||
      types.includes('sublocality_level_1') ||
      types.includes('neighborhood')
    ) {
      sublocality = component.long_name;
    } else if (
      types.includes('locality') ||
      types.includes('postal_town') ||
      types.includes('administrative_area_level_2')
    ) {
      city = component.long_name;
    } else if (types.includes('administrative_area_level_1')) {
      state = component.long_name;
    } else if (types.includes('postal_code')) {
      zip = component.long_name;
    } else if (types.includes('country')) {
      country = component.long_name;
    }
  }

  const streetParts = [streetNumber, route, sublocality].filter(Boolean);
  let street = streetParts.join(', ');

  // If street is empty, fallback to first part of formatted address
  if (!street && formattedAddress) {
    const parts = formattedAddress.split(',');
    street = parts.slice(0, 2).join(', ').trim();
  }

  return {
    street: street || formattedAddress || '',
    city,
    state,
    zip,
    country,
    formattedAddress,
  };
}

/**
 * Reverse geocode latitude and longitude to a structured address
 */
export async function reverseGeocodeLocation(
  lat: number,
  lng: number,
): Promise<ParsedAddress | null> {
  const isLoaded = await loadGoogleMapsScript();
  if (!isLoaded || !(window as any).google?.maps?.Geocoder) {
    return null;
  }

  const geocoder = new (window as any).google.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode(
      { location: { lat, lng } },
      (results: any[], status: string) => {
        if (status === 'OK' && results && results[0]) {
          const parsed = extractAddressComponents(
            results[0].address_components,
            results[0].formatted_address,
          );
          resolve(parsed);
        } else {
          resolve(null);
        }
      },
    );
  });
}
