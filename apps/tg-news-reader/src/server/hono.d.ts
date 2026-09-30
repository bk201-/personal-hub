// Extend Hono's context map so c.get('userId') etc. are typed in all routes.
import 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    userRole: string;
    sessionId: string;
  }
}
