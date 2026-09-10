import { Link } from "wouter";

export function NoEncontrado() {
	return (
		<section>
			<h1 style={{ fontSize: "var(--texto-titulo)" }}>No encontramos esta página</h1>
			<p style={{ color: "var(--tinta-suave)" }}>
				El enlace puede estar equivocado o el libro ya no está publicado.
			</p>
			<p>
				<Link href="/">Volver al catálogo</Link>
			</p>
		</section>
	);
}
