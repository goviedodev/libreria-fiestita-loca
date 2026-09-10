export const CONDICIONES = ["nuevo", "usado"] as const;
export const ESTADOS_LIBRO = ["disponible", "reservado", "vendido"] as const;

export type Condicion = (typeof CONDICIONES)[number];
export type EstadoLibro = (typeof ESTADOS_LIBRO)[number];

/** Un ejemplar del inventario, tal como lo ve el backoffice. */
export interface Libro {
	id: string;
	isbn: string | null;
	titulo: string;
	autor: string;
	editorial: string | null;
	anio: number | null;
	genero: string | null;
	sinopsis: string | null;
	condicion: Condicion;
	precio: number;
	estado: EstadoLibro;
	imagenUrl: string | null;
	dadoDeBaja: boolean;
	creadoEn: string;
}

/** Lo que ve un visitante: sin los campos internos de administración. */
export type LibroPublico = Omit<Libro, "dadoDeBaja">;
