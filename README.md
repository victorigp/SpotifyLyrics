# SpotifyLyrics 🎵

Una aplicación web moderna y minimalista para visualizar letras de canciones sincronizadas en tiempo real, utilizando la API de Last.fm para detectar lo que escuchas en Spotify.

## ✨ Características

- **Sincronización en Tiempo Real**: Detecta automáticamente la canción que estás escuchando en Spotify a través de Last.fm.
- **Modos de Visualización**:
  - **Modo Karaoke**: Enfoque en la línea actual con tipografía dinámica y de gran tamaño.
  - **Letras Completas**: Vista clásica con scroll automático suave.
- **Ajuste de Sincronización**: Control manual (+/- 0.5s) para corregir desfases de latencia.
- **Memoria Inteligente**: Recuerda qué proveedor de letras funcionó mejor para cada canción para cargas instantáneas en el futuro.
- **Diseño Premium**: Interfaz oscura, minimalista y responsiva, optimizada para móviles y pantallas completas.

## 🚀 Instalación y Uso Local

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/victorigp/SpotifyLyrics.git
    cd SpotifyLyrics
    ```

2.  **Instalar dependencias**:
    ```bash
    npm install
    ```

3.  **Configurar variables de entorno**:
    Crea un archivo `.env.local` en la raíz con tu API Key de Last.fm:
    ```env
    LASTFM_API_KEY=tu_api_key_aqui
    ```

4.  **Ejecutar en desarrollo**:
    ```bash
    npm run dev
    ```

## 🛠️ Tecnologías

- **Next.js 15+** (App Router)
- **React 19**
- **Tailwind CSS 4**
- **API de Last.fm**
- **LRCLIB & Lyrics.ovh** (Proveedores de letras)

## 🌐 Despliegue

Optimizado para desplegar en **Vercel**. Asegúrate de configurar la variable de entorno `LASTFM_API_KEY` en el panel de control de Vercel.

---
Creado por [victorigp](https://github.com/victorigp)
