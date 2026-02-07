"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

function LoginContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get("error");
    const callbackUrl = searchParams.get("callbackUrl") || "/";

    const handleSpotifyLogin = () => {
        signIn("spotify", { callbackUrl });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
            <div className="w-full max-w-md bg-zinc-900/50 p-8 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-sm">
                <h1 className="text-3xl font-bold mb-2 text-center text-green-500">
                    Iniciar Sesión
                </h1>
                <p className="text-gray-400 text-center mb-8">
                    Conecta tu cuenta de Spotify
                </p>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-200 text-sm text-center">
                        {error === "Configuration" && "Error de configuración del servidor. ¿Faltan las claves de Spotify?"}
                        {error === "AccessDenied" && "Acceso denegado. Has cancelado el inicio de sesión."}
                        {error === "OAuthCallback" && "Error al recibir respuesta de Spotify."}
                        {!["Configuration", "AccessDenied", "OAuthCallback"].includes(error) && (
                            <div className="flex flex-col gap-2">
                                <span>Ocurrió un error inesperado al intentar conectar.</span>
                                <span className="text-xs font-mono bg-black/20 p-1 rounded">Code: {error}</span>
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleSpotifyLogin}
                    className="w-full py-4 bg-[#1DB954] text-black font-bold rounded-xl hover:bg-[#1ed760] transition mb-4 flex items-center justify-center gap-3 shadow-lg shadow-green-900/20"
                >
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>
                    Continuar con Spotify
                </button>

                <Link
                    href="/"
                    className="block w-full py-3 text-center text-gray-400 hover:text-white text-sm transition mt-6 hover:underline"
                >
                    ← Volver al inicio
                </Link>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-black" />}>
            <LoginContent />
        </Suspense>
    );
}
