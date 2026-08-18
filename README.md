# TOCAScAmE

Aplicación web para el análisis matricial de armaduras planas 2D, desarrollada para visualizar cada etapa del método de rigidez y permitir el cálculo de modelos personalizados.

## Demo

[Usar TOCAScAmE en línea](https://tocascame-armaduras.jtocasc24-1.chatgpt.site)

## Funcionalidades

- Edición de nodos, coordenadas, barras, área transversal, módulo de elasticidad, cargas y restricciones.
- Visualización interactiva de la armadura original y su deformada.
- Matrices de rigidez local y global de cada elemento.
- Grados de libertad por barra y grados de libertad restringidos.
- Ensamblaje de la matriz de rigidez global del sistema.
- Vector de fuerzas aplicadas y correspondencia con sus GDL.
- Matriz reducida de los grados de libertad libres.
- Cálculo de desplazamientos nodales y reacciones.
- Deformación unitaria, esfuerzo y fuerza normal por barra.
- Clasificación gráfica de barras en tracción, compresión o estado neutro.
- Exportación ordenada del informe a PDF y de los resultados a Excel.
- Modo claro y oscuro.
- Registro, ingreso y guardado local de proyectos en el navegador.
- Sección de teoría del método matricial.

## Ejemplos incluidos

- **Ejemplo 1:** armadura simétrica de 6 nodos y 9 barras, reproducida desde el primer notebook guía.
- **Ejemplo 2:** armadura compuesta de 28 nodos y 58 barras, reproducida desde el segundo notebook guía.
- **Nuevo modelo:** plantilla editable para analizar otras estructuras.

## Modelo de cálculo

El motor considera armaduras planas con dos grados de libertad traslacionales por nodo, barras articuladas, comportamiento elástico lineal, deformaciones pequeñas y carga axial. La coherencia de unidades es responsabilidad del usuario: las coordenadas, el área, el módulo de elasticidad y las fuerzas deben pertenecer a un mismo sistema.

## Tecnologías

React 19, TypeScript, CSS, Vite/Vinext, jsPDF, AutoTable y SheetJS.

## Ejecución local

Requisitos: Node.js 22.13 o superior.

1. Clona el repositorio.
2. Ejecuta `npm install`.
3. Inicia el entorno con `npm run dev`.
4. Abre la dirección local indicada en la terminal.

Comandos de verificación:

- `npm run lint`
- `npm run build`
- `npm test`

## Estructura principal

- `app/truss-engine.ts`: motor de análisis matricial.
- `app/truss-examples.ts`: modelos de los dos notebooks y plantilla editable.
- `app/truss-app.tsx`: interfaz, tablas, gráficos y exportaciones.
- `app/globals.css`: diseño adaptable, modo claro y oscuro.
- `tests/`: pruebas del artefacto compilado.

## Autor

**Jhoel Tocas Cercado**  
Universidad Nacional de Cajamarca

> Herramienta académica y didáctica. Para decisiones de diseño estructural real, los resultados deben ser revisados por un profesional competente.
