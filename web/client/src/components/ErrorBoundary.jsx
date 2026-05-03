import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || "Unknown error" };
  }

  componentDidCatch(err, info) {
    console.error("[ErrorBoundary]", err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Something went wrong.</h2>
          <p style={{ color: "#666", marginTop: "0.5rem" }}>{this.state.message}</p>
          <button
            style={{ marginTop: "1rem", padding: "0.5rem 1.5rem", cursor: "pointer" }}
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
