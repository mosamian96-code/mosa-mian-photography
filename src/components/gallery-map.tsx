"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "leaflet/dist/leaflet.css";
import type { GalleryImage } from "@/lib/public-site/resolve";

// Loaded via next/dynamic({ ssr:false }) only on galleries that actually have
// geotagged photos (brief section 4 gap-fill: a maps content block) -- Leaflet plus
// its CSS is real weight (~40KB) with no reason to touch a gallery with no GPS data
// at all, which is most of them.
export default function GalleryMap({ images }: { images: GalleryImage[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const points = images.filter((img) => img.gpsLat != null && img.gpsLon != null);
      if (points.length === 0) return;

      map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      const markers = points.map((img) => {
        const marker = L.circleMarker([img.gpsLat!, img.gpsLon!], {
          radius: 6,
          color: "#171717",
          weight: 1,
          fillColor: "#171717",
          fillOpacity: 0.7,
        }).addTo(map!);
        marker.on("click", () => {
          const params = new URLSearchParams(searchParams);
          params.set("i", String(images.indexOf(img)));
          router.push(`?${params.toString()}`, { scroll: false });
        });
        marker.bindTooltip(img.caption ?? img.filename);
        return marker;
      });

      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 14 });
    }

    void init();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- images/router/searchParams are stable for this component's lifetime (one mount per gallery page)
  }, []);

  const hasGeotagged = images.some((img) => img.gpsLat != null && img.gpsLon != null);
  if (!hasGeotagged) return null;

  return (
    <div
      ref={containerRef}
      className="mt-6 h-64 w-full overflow-hidden rounded bg-neutral-100"
      aria-label="Photo locations"
    />
  );
}
