# Backrooms VR — versión 3.0

Juego de terror psicológico de los Backrooms (Nivel 0, Las Piscinas y Nivel 1 · La Bodega) hecho con **A-Frame 1.6.0** para jugarse en un visor **VR Box / Google Cardboard** desde el navegador del celular. Los sonidos se generan con Web Audio API. Las texturas del Nivel 0 y las Piscinas se dibujan con Canvas; la Bodega usa texturas PBR de concreto en `assets/level1/`.

## Jugar
- **En línea (HTTPS):** https://jorgedavid248961.github.io/backrooms-vr/
- **En PC:** sirve la carpeta con un servidor local, por ejemplo `python -m http.server 8000`, y abre http://localhost:8000

## Niveles (menú principal)
- **Nivel 0 · El Vestíbulo:** papel tapiz amarillo, alfombra húmeda, fluorescentes que parpadean.
- **Las Piscinas (Poolrooms):** azulejos blancos, techos altos, piscinas poco profundas con agua animada, goteos y eco. En el agua caminas más lento y tus pasos chapotean.
- **Nivel 1 · La Bodega (realista):** concreto con materiales PBR (color, relieve y rugosidad), estanterías con cajas, charcos que reflejan, goteras y zonas donde las lámparas murieron.
- Casilla **Con la entidad**: desmárcala para explorar sin que nadie te persiga.

## Cómo se juega (v3)
- **Mapa nuevo en cada partida:** el laberinto se genera con una semilla aleatoria cada vez que entras o reinicias.
- **Notas:** junta las 5 notas para abrir la salida. Mientras falten, el letrero EXIT está en rojo y la puerta está cerrada.
- **Linterna con batería:** se gasta mientras está encendida y parpadea cuando queda poca. Hay pilas escondidas por el mapa, varias en las zonas oscuras.
- **Correr:** más rápido pero gasta energía, y la entidad te oye desde lejos.
- **Entidad más lista:** te oye si caminas cerca o corres, va a investigar el ruido y, si te pierde de vista, te busca alrededor de donde te vio. Con la linterna apagada en la oscuridad sólo te ve de cerca.
- **Récords:** tu mejor tiempo por nivel se guarda en el celular y aparece en el menú.

## Controles
| Dispositivo | Cómo caminar | Mirar |
|---|---|---|
| VR Box + control Bluetooth | Joystick / cruceta | Giroscopio |
| Sin control | Mantener tocada la pantalla (2 dedos = atrás) o mirar el círculo del suelo 1 s | Giroscopio |
| PC | WASD / flechas | Clic + ratón |

| Acción | Control Bluetooth | Teclado |
|---|---|---|
| Linterna | Botón A / X / Y | F |
| Correr | Botón B o gatillos | Shift |

Reiniciar tras ganar o perder: tocar la pantalla, cualquier botón del control, o `R`.

**Calibrar visor ⚙ (v2):** la primera vez que entras al Modo VR Box se abre la calibración. Ajusta la separación de lentes, la altura, el tamaño, la curvatura (k1, k2) y el campo de visión hasta que las dos cruces verdes se vean como una sola. También se puede ajustar con el control Bluetooth puesto (joystick ↑↓ elige, ←→ ajusta, botón termina). Se guarda en el celular. Hay perfiles para VR Box, Cardboard v1 y v2.

**Modo VR Box 👓**: pantalla dividida estereoscópica que funciona en cualquier celular (incluido iPhone). El botón de gafas de A-Frame (abajo a la derecha) usa WebXR nativo cuando el navegador lo soporta (Chrome Android).

## Estructura
```
index.html        escena y pantalla de inicio
css/style.css     menú y HUD de victoria/derrota
js/textures.js    texturas procedurales (Canvas)
js/audio.js       audio procedural (Web Audio API)
js/maze.js        laberinto, temas, colisiones, luces, charcos y goteras
js/controls.js    gamepad, táctil, mirada y teclado
js/entity.js      IA de la entidad
js/stereo.js      render VR Box calibrable con corrección de lentes
js/items.js       linterna, batería, pilas y notas
js/game.js        estados, niveles, récords, susto, victoria y modo VR Box
assets/level1/    texturas de concreto de la Bodega (color, normal, rough)
tools/gen_level1_textures.py  generador de esas texturas (Python + numpy + Pillow)
```

### Usar fotos reales en la Bodega
Puedes reemplazar los archivos de `assets/level1/` por texturas fotográficas (por ejemplo de ambientCG o Poly Haven, con licencia CC0) usando **los mismos nombres**: `wall_color.jpg`, `wall_normal.jpg`, `wall_rough.jpg`, y lo mismo con `floor_` y `ceil_`. Deben ser repetibles (tileable), cuadradas y de 1024 px para que carguen rápido en el celular. Después sube el número de versión `?v=` en `index.html` (y `window.BR_ASSET_V` si lo defines, por defecto `3.0`) para que el celular no use la copia vieja.
