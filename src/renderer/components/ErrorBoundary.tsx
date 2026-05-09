import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[driftpet] renderer error:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.card}>
            <div style={styles.icon}>⚠</div>
            <h2 style={styles.title}>出了点问题</h2>
            <p style={styles.message}>
              {this.state.error?.message ?? "宠物壳意外崩溃了。"}
            </p>
            <button
              style={styles.button}
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
    background: "rgba(26, 26, 46, 0.95)",
    borderRadius: 18,
    padding: 24,
  },
  card: {
    textAlign: "center",
    color: "#e0e0e0",
  },
  icon: {
    fontSize: 36,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    margin: "0 0 8px 0",
  },
  message: {
    fontSize: 12,
    color: "#888",
    margin: "0 0 16px 0",
    maxWidth: 280,
    lineHeight: 1.5,
  },
  button: {
    background: "rgba(233, 69, 96, 0.2)",
    color: "#e94560",
    border: "1px solid rgba(233, 69, 96, 0.3)",
    borderRadius: 8,
    padding: "8px 20px",
    fontSize: 13,
    cursor: "pointer",
  },
};
