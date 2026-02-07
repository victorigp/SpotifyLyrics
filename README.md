<img width="958" height="477" alt="image" src="https://github.com/user-attachments/assets/0bd4b86d-3740-48da-86fe-8788f54b8617" />

# SpotifyLyrics 🎵

Desplegado en https://spotify-lyrics-three.vercel.app/

Una aplicación web para visualizar letras de canciones sincronizadas en tiempo real, utilizando la API de Spotify o Last.fm para detectar lo que escuchas en Spotify.

## ✨ Características

- **Sincronización en Tiempo Real**: Detecta automáticamente la canción que estás escuchando en Spotify.
- **Modos de Visualización**:
  - **Modo Karaoke**: Enfoque en la línea actual con tipografía dinámica y de gran tamaño.
  - **Letras Completas**: Vista clásica con scroll automático suave.
- **Ajuste de Sincronización**: Control manual (+/- 0.5s) para corregir desfases de latencia.
- **Fondo de Video Dinámico 🎥**:
  - Busca y reproduce automáticamente el video oficial (o mejor coincidencia) de la canción en YouTube.
  - **Sistema de Preferencias Inteligente**: Si saltas un video manualmente, la aplicación recordará tu elección para la próxima vez (persistente por usuario).
  - **Cola Natural**: Mantiene el orden original de resultados de YouTube, permitiéndote explorar alternativas fácilmente.
- **Memoria Inteligente**: Recuerda qué proveedor de letras, qué desfase de latencia y qué video funcionó mejor para cada canción.
- **Diseño Responsive**: Interfaz oscura y minimalista, optimizada para móviles y pantallas completas.

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
    Crea un archivo `.env.local` en la raíz con tus claves:
    ```env
    # Para Last.fm, consíguela en: https://www.last.fm/api/account/create
    LASTFM_API_KEY=tu_api_key_aqui
    
    # Para Last.fm, consíguela en: https://developer.spotify.com/dashboard
    SPOTIFY_CLIENT_ID=tu_client_id_aqui
    SPOTIFY_CLIENT_SECRET=tu_client_secret_aqui
    
    NEXTAUTH_URL=http://localhost:3000
    NEXTAUTH_SECRET=una_frase_aleatoria_muy_larga_para_seguridad

    # Para la BDD de Redis (letras, latencia y preferencias de video), consíguela en: https://cloud.redis.io/#/databases
    REDIS_URL=redis://default:tu_password_aqui

    # Para buscar videos de fondo (Google Cloud Console > YouTube Data API v3)
    YOUTUBE_API_KEY=tu_youtube_api_key
    ```

4.  **Ejecutar en desarrollo**:
    ```bash
    npm run dev
    ```

## 🛠️ Tecnologías

- **Next.js 15+** (App Router)
- **React 19**
- **Tailwind CSS 4**
- **API de Last.fm, Spotify, YouTube y Redis**
- **LRCLIB & Lyrics.ovh** (Proveedores de letras)

## 🌐 Despliegue

Optimizado para desplegar en **Vercel**. Asegúrate de configurar las variables de entorno del punto 3 (cambiando NEXTAUTH_URL por la url real donde esté la web) en el panel de control de Vercel.

---
Creado por [victorigp](https://github.com/victorigp)
