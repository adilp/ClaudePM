/**
 * Sessions Page
 * Active sessions list view
 */

import { SessionList } from '../components/SessionList';

export function Sessions() {
  return (
    <div className="page page--sessions">
      <SessionList />
    </div>
  );
}
