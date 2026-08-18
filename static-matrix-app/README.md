# TOCAScAmE Web · Análisis matricial de armaduras 2D

Aplicación estática en HTML, CSS y JavaScript basada en los procedimientos de los notebooks **Example 1** y **Example 2** proporcionados por Jhoel Tocas Cercado (Universidad Nacional de Cajamarca).

## Funciones

- Example 1 y Example 2 precargados.
- Edición de nodos, coordenadas, barras, área A, módulo E, cargas y apoyos.
- Visualización de la armadura y deformada.
- Matrices de rigidez locales y globales por elemento.
- GDL por barra, GDL libres y restringidos.
- Ensamblaje de la matriz global K.
- Vector global de fuerzas F.
- Matriz reducida Kff.
- Desplazamientos nodales.
- Reacciones R = KU - F.
- Deformación unitaria, esfuerzo y fuerza normal.
- Clasificación tracción / compresión.
- Exportación a PDF, Excel y JSON.
- Modo claro/oscuro.
- Login y registro local de demostración.
- Apartado de teoría.
- Diseño adaptable a laptop y móvil.

## Ejecutar

Abre `index.html` en un navegador moderno o sirve la carpeta con:

```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080/static-matrix-app/` si ejecutas el servidor desde la raíz del repositorio.

## Autenticación

El login incluido usa `localStorage` y Web Crypto como demostración frontend. Para usuarios reales en producción se recomienda integrar Firebase Auth, Supabase Auth o un backend con sesiones seguras.

## Método estructural

Se usa el método de rigidez directa para armaduras 2D, con dos GDL traslacionales por nodo. La rigidez axial local es:

`k = (AE/L) [[1,-1],[-1,1]]`

La matriz elemental se transforma a coordenadas globales, se ensambla en K, se aplican restricciones, se resuelve `Kff Uf = Ff` y finalmente se calculan reacciones y esfuerzos internos.

## Créditos

**Jhoel Tocas Cercado**  
Universidad Nacional de Cajamarca  
Proyecto: **TOCAScAmE**