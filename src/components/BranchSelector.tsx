'use client';

import { useBranch } from '@/contexts/BranchContext';

export function BranchSelector() {
  const { currentBranch, branches, selectBranch, isLoading } = useBranch();

  if (isLoading) {
    return <span className="branch-selector-loading">...</span>;
  }

  // If 0 branches - user has no access yet
  if (branches.length === 0) {
    return (
      <span className="branch-badge branch-badge-warning">Sin acceso</span>
    );
  }

  // If only 1 branch, show compact badge (auto-selected)
  if (branches.length === 1) {
    const branch = branches[0];
    return (
      <span className="branch-badge" onClick={() => selectBranch(branch)}>
        {branch.name}
      </span>
    );
  }

  // If multiple branches, show dropdown
  return (
    <select
      className="branch-selector"
      value={currentBranch?.id || ''}
      onChange={(e) => {
        const branch = branches.find(b => b.id === e.target.value);
        if (branch) selectBranch(branch);
      }}
    >
      {branches.map(branch => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </select>
  );
}

// Add styles via global CSS class - these classes are in globals.css or component styles
