import { Suspense, use, useState, type ReactNode } from "react";

/**
 * Pide un recurso una sola vez y entrega el valor ya resuelto.
 *
 * La promesa se crea **aquí**, en un componente que no suspende, y se consume con
 * `use()` en el hijo, que sí suspende contra el `<Suspense>` que este componente
 * monta.
 *
 * Crear la promesa en el mismo componente que la consume es un bucle infinito:
 * al suspender, React descarta el render a medio hacer, y en el reintento el
 * inicializador de `useState` vuelve a correr y crea otra promesa, que suspende
 * otra vez. Se ve como una petición por fotograma y una pantalla que nunca sale
 * del "Cargando…".
 */
export function Recurso<T>({
	pedir,
	respaldo,
	children,
}: {
	pedir: () => Promise<T>;
	respaldo: ReactNode;
	children: (valor: T) => ReactNode;
}) {
	const [promesa] = useState(pedir);
	return (
		<Suspense fallback={respaldo}>
			<Resuelto promesa={promesa}>{children}</Resuelto>
		</Suspense>
	);
}

function Resuelto<T>({
	promesa,
	children,
}: {
	promesa: Promise<T>;
	children: (valor: T) => ReactNode;
}) {
	return <>{children(use(promesa))}</>;
}
