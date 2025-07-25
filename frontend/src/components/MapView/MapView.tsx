import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Box } from '@mui/material';
import type { Bus } from '../../types';

// Importar los iconos de Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

// Configurar el icono por defecto de Leaflet
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const getStatusColor = (status: Bus['status']) => {
  switch (status) {
    case 'OK':
      return '#4caf50';
    case 'WARNING':
      return '#ff9800';
    case 'KO':
      return '#f44336';
    default:
      return '#757575';
  }
};

interface MapViewProps {
  buses: Bus[];
}

// Componente para actualizar el mapa cuando cambian los buses
const MapUpdater = ({ buses }: { buses: Bus[] }) => {
  const map = useMap();
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    // Limpiar marcadores existentes
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Si no hay buses, no hacer nada más
    if (buses.length === 0) return;

    // Ajustar el mapa a los límites de los buses
    const bounds = L.latLngBounds(buses.map(bus => [bus.latitude, bus.longitude]));
    map.fitBounds(bounds);

    // Agregar nuevos marcadores
    buses.forEach((bus) => {
      const marker = L.marker([bus.latitude, bus.longitude], {
        icon: L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="background-color: ${getStatusColor(bus.status)}; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: white;">🚌</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });

      const popupContent = `
        <div style="padding: 8px; min-width: 200px;">
          <div style="margin-bottom: 8px;">
            <strong>Bus ${bus.id}</strong>
          </div>
          <div style="margin-bottom: 4px; color: #666;">
            Estado: ${bus.status}
          </div>
          <div style="margin-bottom: 4px; color: #666;">
            Última actualización: ${new Date(bus.updatedAt).toLocaleString()}
          </div>
          <a href="/buses/${bus.id}" 
             style="display: block; margin-top: 8px; padding: 6px 12px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 4px; text-align: center; font-size: 14px;">
            Ver detalles del bus
          </a>
        </div>
      `;

      const popup = L.popup({
        maxWidth: 300,
        className: 'custom-popup'
      }).setContent(popupContent);

      marker.bindPopup(popup);
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [buses, map]);

  return null;
};

export const MapView = ({ buses }: MapViewProps) => {
  const [mapReady, setMapReady] = useState(false);

  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      <MapContainer
        style={{ width: '100%', height: '100%' }}
        center={[39.5789, 2.6445]} // Coordenadas de Palma de Mallorca
        zoom={13}
        whenReady={() => setMapReady(true)}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {mapReady && <MapUpdater buses={buses} />}
      </MapContainer>
    </Box>
  );
}; 