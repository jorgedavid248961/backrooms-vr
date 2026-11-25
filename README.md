# Backrooms VR — Nivel 0

Juego de terror psicológico de los Backrooms (Nivel 0 y Las Piscinas) hecho con **A-Frame 1.6.0** para jugarse en un visor **VR Box / Google Cardboard** desde el navegador del celular. Todas las texturas se generan con Canvas y todos los sonidos con Web Audio API: no hay imágenes ni audios externos.

## Jugar
- **En línea (HTTPS):** https://jorgedavid248961.github.io/backrooms-vr/
- **En PC:** sirve la carpeta con un servidor local, por ejemplo `python -m http.server 8000`, y abre http://localhost:8000

## Niveles (menú principal)
- **Nivel 0 · El Vestíbulo:** papel tapiz amarillo, alfombra húmeda, fluorescentes que parpadean.
- **Las Piscinas (Poolrooms):** azulejos blancos, techos altos, piscinas poco profundas con agua animada, goteos y eco. En el agua caminas más lento y tus pasos chapotean.
- Casilla **Con la entidad**: desmárcala para explorar sin que nadie te persiga.

## Controles
| Dispositivo | Cómo caminar | Mirar |
|---|---|---|
| VR Box + control Bluetooth | Joystick / cruceta | Giroscopio |
| Sin control | Mantener tocada la pantalla (2 dedos = atrás) o mirar el círculo del suelo 1 s | Giroscopio |
| PC | WASD / flechas | Clic + ratón |

Reiniciar tras ganar o perder: tocar la pantalla, cualquier botón del control, o `R`.

**Calibrar visor ⚙ (v2):** la primera vez que entras al Modo VR Box se abre la calibración. Ajusta la separación de lentes, la altura, el tamaño, la curvatura (k1, k2) y el campo de visión hasta que las dos cruces verdes se vean como una sola. También se puede ajustar con el control Bluetooth puesto (joystick ↑↓ elige, ←→ ajusta, botón termina). Se guarda en el celular. Hay perfiles para VR Box, Cardboard v1 y v2.

**Modo VR Box 👓**: pantalla dividida estereoscópica que funciona en cualquier celular (incluido iPhone). El botón de gafas de A-Frame (abajo a la derecha) usa WebXR nativo cuando el navegador lo soporta (Chrome Android).

## Estructura
```
index.html        escena y pantalla de inicio
css/style.css     menú y HUD de victoria/derrota
js/textures.js    texturas procedurales (Canvas)
js/audio.js       audio procedural (Web Audio API)
js/maze.js        laberinto 18x18, colisiones, luces y parpadeo
js/controls.js    gamepad, táctil, mirada y teclado
js/entity.js      IA de la entidad
js/stereo.js      render VR Box calibrable con corrección de lentes
js/game.js        estados, HUD en VR, susto, victoria y modo VR Box
```
