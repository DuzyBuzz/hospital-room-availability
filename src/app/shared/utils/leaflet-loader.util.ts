type LeafletModule = typeof import('leaflet');

type LeafletImport = LeafletModule & {
  default?: LeafletModule;
};

export async function loadLeaflet(): Promise<LeafletModule> {
  const leafletImport = (await import('leaflet/dist/leaflet-src.esm.js')) as LeafletImport;

  return leafletImport.default ?? leafletImport;
}
