import React, { useEffect, useRef, useState } from 'react';
import {
  MapPin,
  Navigation,
  Loader2,
  CheckCircle2,
  Sparkles,
  Search,
} from 'lucide-react';
import {
  loadGoogleMapsScript,
  extractAddressComponents,
  reverseGeocodeLocation,
  type ParsedAddress,
  getGoogleMapsApiKey,
} from '../lib/google-maps';

interface GoogleAddressAutocompleteProps {
  onAddressSelected: (address: ParsedAddress) => void;
  currentStreet?: string;
  className?: string;
}

export function GoogleAddressAutocomplete({
  onAddressSelected,
  currentStreet = '',
  className = '',
}: GoogleAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const key = getGoogleMapsApiKey();
    setHasApiKey(Boolean(key));

    if (key) {
      void loadGoogleMapsScript(key).then((loaded) => {
        setIsScriptLoaded(loaded);
      });
    }
  }, []);

  // Initialize Google Maps Places Autocomplete
  useEffect(() => {
    if (!isScriptLoaded || !inputRef.current || !(window as any).google?.maps?.places) {
      return;
    }

    try {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(
        inputRef.current,
        {
          fields: ['address_components', 'formatted_address', 'geometry'],
          types: ['address'],
        },
      );

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place && place.address_components) {
          const parsed = extractAddressComponents(
            place.address_components,
            place.formatted_address,
          );
          onAddressSelected(parsed);
          setLocationSuccess(true);
          setTimeout(() => setLocationSuccess(false), 3000);
        }
      });

      autocompleteRef.current = autocomplete;
    } catch (err) {
      console.warn('Google Places Autocomplete init warning:', err);
    }

    return () => {
      if (autocompleteRef.current && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(
          autocompleteRef.current,
        );
      }
    };
  }, [isScriptLoaded, onAddressSelected]);

  // Handle HTML5 Geolocation (Current Location Button)
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setLocationSuccess(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const parsed = await reverseGeocodeLocation(latitude, longitude);

          if (parsed) {
            onAddressSelected(parsed);
            if (inputRef.current && parsed.formattedAddress) {
              inputRef.current.value = parsed.formattedAddress;
            }
            setLocationSuccess(true);
            setTimeout(() => setLocationSuccess(false), 3000);
          } else {
            // Fallback if Google reverse geocoding is unavailable
            onAddressSelected({
              street: `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
              city: '',
              state: '',
              zip: '',
            });
          }
        } catch (error) {
          console.error('Error reverse geocoding location:', error);
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          alert('Location permission was denied. Please enter your address manually.');
        } else {
          alert('Could not determine current location. Please enter manually.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5">
          <Sparkles size={13} className="text-indigo-600 dark:text-indigo-400" />
          <span>Search with Google Maps or GPS</span>
        </label>

        {/* Use Current Location Button */}
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={isLocating}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2.5 py-1 rounded-lg transition-all active:scale-95 border border-indigo-200/80 dark:border-indigo-800/80"
        >
          {isLocating ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              <span>Detecting GPS...</span>
            </>
          ) : locationSuccess ? (
            <>
              <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400">Location Found!</span>
            </>
          ) : (
            <>
              <Navigation size={12} />
              <span>Use Current Location</span>
            </>
          )}
        </button>
      </div>

      {/* Places Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400 dark:text-neutral-500">
          <Search size={16} />
        </div>

        <input
          ref={inputRef}
          type="text"
          defaultValue={currentStreet}
          placeholder={
            hasApiKey
              ? 'Type apartment, street, landmark, area to autofill...'
              : 'Google Maps Places Search (Add VITE_GOOGLE_MAPS_API_KEY to enable live autocomplete)'
          }
          className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
        />

        {hasApiKey && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Google Places
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
