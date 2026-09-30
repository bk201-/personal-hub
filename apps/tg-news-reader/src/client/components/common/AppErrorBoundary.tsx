import React from 'react';
import { logger } from '../../logger';
import { ErrorPage } from './ErrorPage';

interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Top-level React Error Boundary.
 * Catches any unhandled render-time exception and shows the Oops error page
 * instead of a blank white screen.
 *
 * Must be a class component — React error boundaries cannot be hooks.
 * Placed inside ConfigProvider + StyleProvider so ErrorPage can use antd tokens.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error(
      { module: 'boundary', err: error, componentStack: info.componentStack },
      `React render error: ${error.message}`,
    );
  }

  handleRetry = () => {
    // Clear the caught error first so React re-renders the children
    this.setState({ error: null });
    // If it persists, a full reload is the safest fallback
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return <ErrorPage message={this.state.error.message} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
