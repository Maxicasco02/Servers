import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error?.message || "Se produjo un error inesperado al renderizar la interfaz.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Server Fast UI ErrorBoundary:", error, info);
  }

  handleResetAll = () => {
    try {
      localStorage.removeItem("server_fast_history_v1");
    } catch {
      // Ignore storage errors
    }
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B1117] px-6 text-slate-100">
          <div className="w-full max-w-lg rounded-xl border border-[#1E293B] bg-[#111923] p-6">
            <h1 className="font-display text-lg font-semibold text-slate-100">
              No se pudo mostrar la vista actual
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {this.state.errorMessage}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: "" })}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 cursor-pointer"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={this.handleResetAll}
                className="rounded-lg border border-[#1E293B] bg-[#16202C] px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 cursor-pointer"
              >
                Limpiar historial local y reiniciar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
