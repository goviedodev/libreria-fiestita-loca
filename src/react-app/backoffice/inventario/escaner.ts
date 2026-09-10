/**
 * Detección de la API `BarcodeDetector` del navegador.
 *
 * Vive fuera del componente para que el archivo del componente exporte solo
 * componentes: es lo que necesita el fast refresh de Vite.
 */

export interface CodigoDetectado {
	rawValue: string;
	format: string;
}

export interface DetectorCodigos {
	detect(fuente: CanvasImageSource): Promise<CodigoDetectado[]>;
}

export interface ConstructorDetector {
	new (opciones?: { formats?: string[] }): DetectorCodigos;
}

/** El ISBN vive en el EAN-13 de la contratapa; EAN-8 no se usa para libros. */
export const FORMATOS_CODIGO = ["ean_13"];

export function detectorDisponible(): ConstructorDetector | null {
	if (typeof window === "undefined") return null;
	const global = window as unknown as { BarcodeDetector?: ConstructorDetector };
	return global.BarcodeDetector ?? null;
}

/**
 * `true` solo si el navegador trae el detector y permite pedir la cámara.
 *
 * Donde dé `false` no se monta el escáner y queda el campo manual, que siempre
 * está disponible (design.md §8).
 */
export function hayEscaner(): boolean {
	return detectorDisponible() !== null && typeof navigator.mediaDevices?.getUserMedia === "function";
}
