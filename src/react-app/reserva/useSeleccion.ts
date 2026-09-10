import { useSyncExternalStore } from "react";
import { obtenerSeleccion, suscribir } from "./seleccion";

/**
 * Lee la selección desde React.
 *
 * `useSyncExternalStore` es la herramienta exacta para esto: la selección vive
 * fuera de React (en un módulo, respaldada por `localStorage`) y varios
 * componentes la miran a la vez. Un `useState` + efecto haría lo mismo peor, y
 * además chocaría con la regla que prohíbe setState síncrono en un efecto.
 */
export function useSeleccion(): readonly string[] {
	return useSyncExternalStore(suscribir, obtenerSeleccion, obtenerSeleccion);
}
