# Plan de reforma del tema claro administrativo

## Estado del documento

- Fecha de creación: 2026-09-04.
- Repositorio principal: `kensar_frontend`.
- Estado: reforma iniciada; fases 1, 2, 3.1 y 3.2 terminadas localmente.
- Producción: fases 1, 2, 3.1 y 3.2 incluidas en el despliegue del 2026-09-04.
- Alcance protegido: el POS operativo debe conservar su apariencia y comportamiento actuales.

## Contexto

Metrik se construyó inicialmente con una interfaz oscura. Posteriormente, la mayor parte del producto administrativo se cambió a una apariencia clara, pero varios componentes conservaron clases y supuestos visuales del diseño original.

Para hacer que esas pantallas antiguas se vieran claras se añadió una capa global de compatibilidad en `app/globals.css`. Esa capa transforma dentro de `.dashboard-theme` clases como `bg-slate-950`, `bg-slate-900`, `text-slate-100` y `border-slate-700` en colores claros.

La capa permitió avanzar sin reescribir toda la aplicación, pero dejó una deuda estructural: cuando se crea un componente nuevo usando otra combinación oscura o un color semántico no contemplado, el resultado puede tener poco contraste. El ejemplo que reveló claramente el problema fue la ayuda azul del modal de ajustes de Documentos, cuyo texto casi no se distinguía del fondo.

## Hallazgos del diagnóstico inicial

1. Los colores raíz de la aplicación ya son claros, pero muchos componentes administrativos continúan escritos con clases de la antigua paleta oscura.
2. `globals.css` contiene selectores amplios bajo `.dashboard-theme` que reinterpretan esas clases antiguas.
3. Los selectores de compatibilidad no cubren todas las combinaciones posibles. Colores como `text-sky-50` pueden conservarse aunque el fondo termine siendo claro.
4. No existía una base semántica consistente para modales, campos, mensajes informativos, advertencias, tablas o botones administrativos.
5. El estado del tema no está completamente normalizado: existen referencias históricas a tema oscuro y claro, pero no hay dos paletas completas conectadas de manera coherente mediante `data-theme`.
6. En la medición inicial se encontraron aproximadamente 24 archivos administrativos con usos de la paleta oscura. Entre componentes y páginas aparecían, entre otros, unos 251 usos de `bg-slate-950`, 222 de `bg-slate-900`, 247 de `text-slate-100` y 264 de `border-slate-700`. Estas cifras son una línea base aproximada y deben recalcularse durante la reforma.

## Objetivo

Convertir el panel administrativo en una interfaz clara por diseño, con colores semánticos predecibles y buen contraste, hasta que deje de depender de la traducción global de clases oscuras.

La reforma debe lograr que:

- los nuevos módulos administrativos nazcan claros sin necesitar excepciones globales;
- los estados informativos, de éxito, advertencia y peligro sean legibles y consistentes;
- modales, tablas, campos y botones reutilicen una misma base visual;
- la migración pueda hacerse en entregas pequeñas y verificables;
- el POS operativo permanezca sin cambios.

## Fuera de alcance

Esta reforma no debe:

- rediseñar el POS operativo;
- cambiar lógica de ventas, pagos, inventario o documentos;
- modificar flujos por razones puramente estéticas;
- introducir un selector de tema oscuro/claro para usuarios;
- eliminar de una sola vez la capa de compatibilidad existente;
- mezclar cambios generales de escala, densidad o zoom con la migración de color.

## Regla de aislamiento del POS

Todos los estilos nuevos deben permanecer bajo `.dashboard-theme`.

Se consideran áreas protegidas y no deben migrarse como parte de este plan sin una aprobación separada:

- `app/pos/**`;
- `app/login-pos/**`;
- componentes específicos del flujo operativo de caja;
- estilos y utilidades cuyo consumidor principal sea el POS;
- `lib/pos/**`, excepto pruebas que únicamente verifiquen que no hubo regresiones.

La ruta `app/dashboard/pos` debe revisarse antes de tocarla: pertenece al panel, pero está estrechamente relacionada con la operación de caja.

## Principios de implementación

1. Migrar una pantalla o bloque coherente por vez.
2. Mantener temporalmente la capa de compatibilidad para las pantallas todavía no migradas.
3. En bloques migrados, usar nombres semánticos en lugar de colores heredados.
4. No combinar en el mismo bloque clases oscuras con primitivas administrativas nuevas.
5. Separar color y contraste de cambios de layout o densidad siempre que sea posible.
6. Mantener la lógica del componente sin modificaciones durante la migración visual.
7. Agregar una protección automática a cada bloque declarado como migrado.
8. Ejecutar las pruebas del POS después de cada fase compartida.
9. No eliminar compatibilidad global hasta confirmar que no quedan consumidores.

## Base visual creada

La primera base está definida en `app/globals.css` y se limita a `.dashboard-theme`.

### Variables administrativas

- superficies: `--admin-surface`, `--admin-surface-subtle`, `--admin-surface-muted`;
- texto: `--admin-text`, `--admin-text-muted`, `--admin-text-soft`;
- bordes y foco: `--admin-border`, `--admin-border-strong`, `--admin-focus`;
- información: `--admin-info-*`;
- advertencia: `--admin-warning-*`;
- peligro: `--admin-danger-*`;
- éxito: `--admin-success-*`;
- fondo de modal: `--admin-backdrop`.

### Primitivas disponibles

- modales: `admin-modal-backdrop`, `admin-modal-panel`;
- tipografía: `admin-title`, `admin-text-muted`, `admin-help-text`, `admin-section-kicker`;
- formularios: `admin-field-label`, `admin-field-control`;
- mensajes: `admin-callout` con variantes `info`, `warning`, `danger` y `success`;
- resúmenes: `admin-summary-panel`, `admin-result-panel`, `admin-stat-card` y sus variantes;
- tablas: `admin-table-shell`, `admin-table-head`, `admin-table-body`, `admin-table-row`, `admin-code`;
- acciones: `admin-button-primary`, `admin-button-secondary`, `admin-button-danger`;
- carga: `admin-loading-overlay`.

Estas primitivas son el punto de partida, no un sistema cerrado. Solo deben ampliarse cuando una necesidad aparezca en más de un componente o resulte claramente reutilizable.

## Trabajo realizado

### Fase 1: fundamento claro y modal de ajustes — completada

- Se creó la paleta semántica administrativa bajo `.dashboard-theme`.
- Se crearon primitivas para modales, formularios, mensajes, tarjetas y botones.
- Se migró por completo el modal de ajustes de Documentos.
- Se corrigió el contraste de la guía azul del ajuste.
- Se migraron las referencias de pago, el cambio entregado, la cantidad a distribuir, las advertencias y el resumen final.
- Se añadieron atributos de accesibilidad: `role="dialog"`, `aria-modal` y título asociado.
- Se eliminó del modal migrado la dependencia de clases oscuras heredadas.

### Fase 2: diálogos restantes de Documentos — completada

- Se migró el modal `Guía de documentos`.
- Se creó una presentación clara y adaptable para la tabla de prefijos.
- Se migró el modal de anulación.
- Se aplicaron acciones secundaria y destructiva semánticas.
- Se reemplazó la capa oscura de carga del detalle por `admin-loading-overlay`.
- Se amplió la prueba para proteger los tres diálogos migrados.

### Fases 3.1 y 3.2: encabezado y filtros de Documentos — completadas

- Se migraron el título, la descripción, el regreso y los accesos de gestión.
- Se migraron etiquetas, inputs, selects, rangos rápidos y botones de búsqueda.
- Se añadieron primitivas para paneles, enlaces, errores, chips y acciones suaves.
- Los modales administrativos se movieron a un portal sobre `document.body`.
- Cada modal lleva su propio scope `.dashboard-theme`, por lo que conserva la paleta administrativa fuera del árbol visual de la página.
- El portal evita que las reglas compactas de `.documents-explorer-scale` deformen o vuelvan transparente el modal de ajustes.
- La prueba de regresión también protege el encabezado y los filtros.

### Protección automática añadida

- Se creó `tests/ui/adminTheme.test.ts`.
- Se añadió el comando `npm run test:ui`.
- La prueba confirma que las primitivas principales permanecen bajo `.dashboard-theme`.
- La prueba impide reintroducir clases de la antigua paleta oscura en los modales de ajuste, guía y anulación.

### Validaciones completadas

Al terminar la fase 2 se verificó:

- `npm run test:ui`: 4 pruebas aprobadas;
- `npm run test:pos`: 16 pruebas aprobadas;
- `npx tsc --noEmit`: aprobado;
- ESLint sobre los archivos modificados: aprobado;
- `git diff --check`: aprobado;
- `npm run build`: compilación de producción aprobada con 51 rutas.

## Archivos y trabajo relacionado que debe preservarse

La reforma utiliza los siguientes archivos del frontend:

- `app/globals.css`;
- `app/components/DocumentsExplorer.tsx`;
- `tests/ui/adminTheme.test.ts`;
- `package.json`;
- `lib/api/documents.ts`.

`lib/api/documents.ts` y parte de `DocumentsExplorer.tsx` también contienen la nueva columna resumida de productos/contenido en la lista de Documentos. Ese trabajo no pertenece a la reforma del tema, pero comparte el despliegue del 2026-09-04 y debe conservarse.

También existe trabajo correspondiente en `kensar_backend` para esa columna. No debe descartarse ni sobrescribirse al continuar esta reforma.

## Plan pendiente

### Fase 3: estructura principal de Documentos

Objetivo: hacer que la pantalla de Documentos sea clara por construcción y reducir notablemente su dependencia de los overrides globales.

Dividir esta fase en entregas pequeñas:

#### 3.1 Encabezado y navegación

- título y descripción;
- botón para regresar cuando exista;
- enlaces `Gestionar separados` y `Gestionar clientes`;
- estados de error cercanos al encabezado.

#### 3.2 Filtros

- etiquetas, inputs, selects y placeholders;
- rangos rápidos de fecha;
- botones Buscar y Limpiar filtros;
- enlace de la guía;
- foco visible, estados deshabilitados y contraste.

#### 3.3 Barra de acciones y avisos

- Ajustar, Anular e impresión;
- estados habilitado, deshabilitado y hover;
- mensajes toast informativos y de error;
- no cambiar las reglas de disponibilidad de cada acción.

#### 3.4 Lista de documentos

- contenedor y encabezado de resultados;
- tabla, cabecera y filas alternas;
- selección y hover;
- badges por tipo de documento;
- nueva columna resumida de productos/contenido;
- paginación, exportación y recarga;
- revisión de anchos y truncamiento en desktop y tablet.

#### 3.5 Panel de detalle

El detalle es amplio y debe migrarse por familia de documento, no todo en una sola edición:

1. estructura base, encabezado y estados de carga;
2. venta y pagos;
3. devolución y cambio;
4. abonos y separados;
5. recepciones, recuentos y movimientos manuales;
6. cierres de caja;
7. notas, historiales y tablas secundarias.

Cada familia terminada debe tener una revisión de contraste y una protección de regresión razonable.

#### 3.6 Responsive de Documentos

- validar desktop a 100 % de zoom;
- validar una pantalla de laptop;
- validar tablet y móvil donde aplique;
- comprobar scroll del modal y de tablas;
- evitar cambios globales de escala durante esta fase.

### Fase 4: consolidación de componentes administrativos

Después de migrar Documentos se debe revisar qué patrones son verdaderamente repetidos.

Posibles componentes compartidos:

- `AdminModal`;
- `AdminCallout`;
- `AdminField` o clases comunes para controles;
- `AdminTable` o piezas de tabla;
- `AdminButton` con variantes;
- estados vacíos, carga y error.

No extraer componentes solo por reducir líneas. La extracción debe mejorar consistencia, accesibilidad o mantenimiento.

### Fase 5: migración del resto del panel administrativo

Antes de comenzar, recalcular usos de clases oscuras con `rg` y ordenar módulos por impacto y reutilización.

Orden sugerido:

1. Clientes y gestión de separados.
2. Movimientos y formularios asociados.
3. Reportes y reportes detallados.
4. Productos.
5. Inversión.
6. Recursos Humanos y horarios.
7. Comercio web.
8. Etiquetas y etiquetado piloto.
9. Configuración y perfil.
10. Inicio y componentes compartidos del dashboard.

La prioridad puede cambiar si un módulo presenta un problema real de legibilidad.

Para cada módulo:

1. inventariar clases oscuras y excepciones semánticas;
2. identificar primitivas reutilizables;
3. migrar un bloque coherente;
4. agregar o ampliar controles de regresión;
5. ejecutar validaciones;
6. revisar visualmente antes de continuar.

### Fase 6: normalización del shell administrativo

Cuando la mayoría de los módulos estén migrados:

- revisar sidebar, topbar, navegación y superficies compartidas;
- normalizar metadatos o atributos históricos de tema;
- decidir si `data-theme` se elimina o se conecta de manera explícita al único tema claro administrativo;
- documentar la forma correcta de construir páginas nuevas;
- revisar que no existan estilos administrativos sin el scope correspondiente.

Esta fase es de mayor alcance y requiere una revisión visual completa.

### Fase 7: retiro de la capa de compatibilidad

No comenzar esta fase mientras existan pantallas que dependan de las reglas globales de traducción.

Proceso:

1. contar los usos restantes de clases oscuras en `app/dashboard` y componentes administrativos;
2. clasificar excepciones legítimas, como previews o contenido deliberadamente oscuro;
3. migrar los últimos consumidores;
4. desactivar temporalmente cada grupo de overrides y ejecutar revisión completa;
5. eliminar solo reglas sin consumidores;
6. compilar, probar y revisar todas las rutas administrativas;
7. confirmar nuevamente que el POS no cambió.

### Fase 8: documentación y prevención permanente

- dejar una guía breve de construcción de UI administrativa;
- incluir ejemplos de campo, modal, tabla, callout y botones;
- considerar una regla de lint o script de auditoría para clases oscuras nuevas;
- permitir excepciones explícitas y documentadas para contenido realmente oscuro;
- mantener `npm run test:ui` como verificación obligatoria.

## Criterios de aceptación por bloque

Un bloque se considera migrado cuando:

- no depende de clases oscuras traducidas globalmente;
- texto, iconos, bordes y fondos tienen contraste claro;
- foco, hover, disabled y estados semánticos son distinguibles;
- la lógica del flujo conserva el mismo comportamiento;
- funciona con contenido largo y valores reales;
- pasa TypeScript, lint y las pruebas relevantes;
- pasa `npm run test:ui` y `npm run test:pos` si se tocaron estilos compartidos;
- se revisó visualmente a 100 % de zoom;
- la protección automática reconoce el bloque como migrado.

## Validación recomendada

Ejecutar desde `kensar_frontend`:

```bash
npm run test:ui
npm run test:pos
npx tsc --noEmit
npx eslint app/components/DocumentsExplorer.tsx tests/ui/adminTheme.test.ts
git diff --check
npm run build
```

Cuando se migren otros archivos, ampliar el comando de ESLint o ejecutar `npm run lint`.

## Auditoría de clases heredadas

Comandos útiles para medir el avance:

```bash
rg -n 'bg-slate-(950|900|800)|text-slate-(50|100|200|300)|border-slate-(800|700)' app/dashboard app/components
rg -l 'bg-slate-(950|900|800)|text-slate-(50|100|200|300)|border-slate-(800|700)' app/dashboard app/components
rg -o 'bg-slate-950|bg-slate-900|text-slate-100|border-slate-700' app/dashboard app/components | sort | uniq -c
```

Los conteos por sí solos no determinan si un bloque está bien. Algunas apariencias oscuras pueden ser deliberadas, pero deben estar identificadas y no depender accidentalmente de los overrides.

## Riesgos y mitigaciones

### Cambiar casi toda la aplicación de una vez

Riesgo: romper pantallas que actualmente se ven claras gracias a la compatibilidad.

Mitigación: conservar los overrides y migrar por bloques.

### Afectar el POS

Riesgo: aplicar selectores globales sin scope o reutilizar una primitiva administrativa dentro del POS.

Mitigación: toda nueva regla administrativa bajo `.dashboard-theme`, prueba de scope y suite del POS en cada fase.

### Crear otro conjunto inconsistente de estilos

Riesgo: añadir una clase nueva para cada caso puntual.

Mitigación: usar roles semánticos y ampliar primitivas solo cuando exista una necesidad reutilizable.

### Perder contraste en estados semánticos

Riesgo: combinar fondos claros con textos pensados para fondos oscuros.

Mitigación: cada variante define conjuntamente fondo, borde y texto.

### Confundir esta reforma con cambios de escala

Riesgo: atribuir problemas de tamaño al tema y modificar tipografía o layout global.

Mitigación: seguir también `docs/plan-correccion-escalado-ui.md` y revisar siempre con zoom del navegador al 100 %.

## Estrategia de commits y despliegue

- Preferir un commit por fase o bloque coherente.
- No mezclar la eliminación de overrides con la migración de una pantalla.
- Documentar en cada commit qué área se declaró migrada.
- Antes de desplegar, ejecutar la validación completa.
- Hacer despliegues acumulados solo cuando se conozca claramente qué funcionalidades adicionales viajan en el mismo commit.
- Después del despliegue, revisar al menos Documentos, un módulo administrativo no migrado y el POS operativo.

## Próximo paso exacto

Continuar con las fases 3.3 y 3.4:

1. migrar la barra de acciones y los avisos sin cambiar sus reglas de disponibilidad;
2. migrar el contenedor y la tabla de documentos;
3. conservar y revisar la nueva columna resumida de productos/contenido;
4. proteger ambos bloques en `tests/ui/adminTheme.test.ts`;
5. ejecutar toda la validación indicada;
6. revisar el resultado antes de comenzar las familias del panel de detalle.

## Texto para retomar el trabajo en otra conversación

> Continuemos la reforma del tema claro administrativo de Metrik. Lee primero `docs/plan-reforma-tema-claro-administrativo.md` y respeta su alcance. Las fases 1, 2, 3.1 y 3.2 ya están terminadas. Los modales se renderizan mediante un portal aislado y el POS operativo no debe cambiar. El próximo paso es la fase 3.3 y 3.4: barra de acciones, avisos y lista de Documentos. Conserva también los cambios locales de la columna resumida de productos.
