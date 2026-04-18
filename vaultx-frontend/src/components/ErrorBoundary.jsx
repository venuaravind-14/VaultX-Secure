import React from 'react';
import { ServerCrash, RotateCcw } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL_UI_ERROR:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-6 text-center">
          <div className="w-24 h-24 bg-danger-100 dark:bg-danger-900/30 text-danger-600 rounded-[2.5rem] flex items-center justify-center mb-8 animate-bounce-slow">
            <ServerCrash size={48} />
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">System Interruption</h1>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mb-2 leading-relaxed">
            A critical UI failure occurred within the secure environment.
          </p>
          
          {this.state.error && (
            <div className="bg-slate-200/50 dark:bg-slate-800/50 p-4 rounded-xl mb-8 font-mono text-xs text-danger-600 dark:text-danger-400 max-w-lg overflow-auto">
              {this.state.error.name}: {this.state.error.message}
            </div>
          )}

          <button
            onClick={() => window.location.href = '/'}
            className="flex items-center gap-3 bg-slate-900 hover:bg-slate-800 dark:bg-primary-600 dark:hover:bg-primary-500 text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-2xl active:scale-95 group"
          >
            <RotateCcw size={20} className="group-hover:rotate-180 transition-transform duration-500" />
            Restore Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
