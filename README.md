# TOCAS Matriz

Aplicación web profesional para el análisis matricial de armaduras planas 2D mediante el método directo de rigidez.

**Aplicación en línea:** [tocas-matriz.jtocasc24-1.chatgpt.site](https://tocas-matriz.jtocasc24-1.chatgpt.site)

## Qué incluye

- Nodos editables por tabla o mediante clic sobre el plano cartesiano con SNAP.
- Barras con área, módulo de elasticidad y material independientes.
- Conversión automática entre mm, cm, m, N, kN, kgf, tf, Pa, kPa, MPa, GPa, kgf/cm² y kN/cm².
- Importación de nodos desde Excel, CSV, TSV o datos pegados.
- Validación de nodos inexistentes, longitudes cero, conexiones duplicadas, A/E no positivos y sistemas singulares.
- Vista SVG interactiva con zoom, pan, apoyos, cargas, ejes locales, longitudes, ángulos y deformada.
- Matrices de transformación, locales y globales de cada elemento.
- Numeración de GDL, restricciones, vector global de cargas y ensamblaje paso a paso.
- Matriz global completa y particiones Kff, Kfr, Krf y Krr.
- Desplazamientos, reacciones, deformaciones, esfuerzos y fuerzas axiales.
- Clasificación de barras en tracción, compresión o fuerza nula.
- Comprobación global de fuerzas y momentos.
- Exportación de informe técnico PDF, libro Excel y proyecto JSON.
- Dos ejemplos resueltos y biblioteca editable de materiales.
- Modo claro/oscuro y diseño adaptable para laptop, tableta y móvil.
- Inicio de sesión con ChatGPT y guardado persistente de proyectos por usuario.
- Sección teórica con formulación y fuentes académicas.

## Motor de cálculo

El motor convierte todos los datos a SI y resuelve una armadura 2D lineal elástica. Para cada barra calcula:

```text
L = √(Δx² + Δy²)
c = Δx/L
s = Δy/L
k' = (AE/L) [ 1  -1 ; -1  1 ]
kᵉ = Tᵀ k' T
```

Después ensambla `K`, separa grados libres y restringidos, resuelve `Kff Uf = Ff` mediante eliminación gaussiana con pivoteo parcial y recupera:

```text
R = KU - F
δ = [-c -s c s] uᵉ
ε = δ/L
σ = Eε
N = Aσ
```

Convención de signos: `N > 0` corresponde a tracción y `N < 0` a compresión.

## Tecnologías

- React 19, TypeScript y CSS.
- Vinext/Vite sobre Cloudflare Workers.
- Cloudflare D1 y Drizzle ORM para proyectos guardados.
- jsPDF + AutoTable para PDF.
- SheetJS para Excel.
- SVG nativo para la visualización estructural.

## Ejecutar localmente

Requisitos: Node.js 22.13 o superior.

```bash
npm install
npm run dev
```

Verificación completa:

```bash
npm run lint
npx tsc --noEmit
npm test
```

## Archivos principales

- `lib/truss.ts`: motor numérico, unidades, validaciones y ejemplos.
- `components/TrussApp.tsx`: flujo de modelado, tablas, resultados y teoría.
- `components/TrussCanvas.tsx`: plano SVG interactivo y deformada.
- `lib/exporters.ts`: generación de PDF, Excel y JSON.
- `app/api/projects/route.ts`: guardado seguro por usuario.
- `db/schema.ts`: esquema de proyectos persistentes.
- `tests/truss.test.ts`: comprobaciones numéricas y de estabilidad.

## Alcance técnico

La aplicación supone barras rectas, uniones articuladas, pequeñas deformaciones, material elástico lineal, propiedades constantes por elemento y cargas aplicadas en nodos. No verifica pandeo, fluencia, conexiones, segundo orden, dinámica ni requisitos normativos.

## Autor

**Jhoel Tocas Cercado**  
Ingeniería Hidráulica — Universidad Nacional de Cajamarca

Herramienta académica y didáctica. Un diseño estructural real debe ser revisado por un profesional competente.

