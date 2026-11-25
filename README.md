# Backrooms VR — Nivel 0

Juego de terror psicológico de los Backrooms (Nivel 0) hecho con **A-Frame 1.6.0** para jugarse en un visor **VR Box / Google Cardboard** desde el navegador del celular. Todas las texturas se generan con Canvas y todos los sonidos con Web Audio API: no hay imágenes ni audios externos.

## Jugar
- **En línea (HTTPS):** https://jorgedavid248961.github.io/backrooms-vr/
- **En PC:** sirve la carpeta con un servidor local, por ejemplo `python -m http.server 8000`, y abre http://localhost:8000

## Controles
| Dispositivo | Cómo caminar | Mirar |
|---|---|---|
| VR Box + control Bluetooth | Joystick / cruceta | Giroscopio |
| Sin control | Mantener tocada la pantalla (2 dedos = atrás) o mirar el círculo del suelo 1 s | Giroscopio |
| PC | WASD / flechas | Clic + ratón |

Reiniciar tras ganar o perder: tocar la pantalla, cualquier botón del control, o `R`.

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
js/game.js        estados, HUD en VR, susto, victoria y modo VR Box
```
