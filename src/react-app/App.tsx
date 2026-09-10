import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { Catalogo } from "./catalogo/Catalogo";
import { Ficha } from "./catalogo/Ficha";
import { ConsultaFolio } from "./reserva/ConsultaFolio";
import { Reserva } from "./reserva/Reserva";
import { Cascaron } from "./ui/Cascaron";
import { NoEncontrado } from "./ui/NoEncontrado";

// El backoffice lo usa una sola persona: se carga aparte para no pesar sobre el
// visitante que solo mira el catálogo (design.md, riesgo del tamaño del bundle).
const Backoffice = lazy(() => import("./backoffice/Backoffice"));

export default function App() {
	return (
		<Switch>
			<Route path="/admin" nest>
				<Suspense fallback={<Cargando />}>
					<Backoffice />
				</Suspense>
			</Route>

			<Route>
				<Cascaron>
					<Switch>
						<Route path="/">
							<Catalogo />
						</Route>
						<Route path="/libro/:id">
							{/* La clave reinicia la consulta al saltar de una ficha a otra. */}
							{(parametros) => <Ficha key={parametros.id} id={parametros.id} />}
						</Route>
						<Route path="/reserva">
							<Reserva />
						</Route>
						<Route path="/reserva/:folio">
							{(parametros) => <ConsultaFolio folio={parametros.folio} />}
						</Route>
						<Route>
							<NoEncontrado />
						</Route>
					</Switch>
				</Cascaron>
			</Route>
		</Switch>
	);
}

function Cargando() {
	return (
		<p style={{ color: "var(--tinta-tenue)", padding: "3rem 1.5rem" }} role="status">
			Cargando…
		</p>
	);
}
