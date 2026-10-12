// client/src/components/Pagination.jsx
import React from "react";

export function Pagination({ page, limit, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startItem = total === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <nav className="pagination-container" aria-label="Sessions pagination">
      <div className="pagination-info">
        Showing <span className="font-semibold">{startItem}</span>–
        <span className="font-semibold">{endItem}</span> of{" "}
        <span className="font-semibold">{total}</span> sessions
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="btn btn-outline pagination-btn"
          aria-label="Previous page"
        >
          &larr; Previous
        </button>

        <span className="pagination-page-indicator">
          Page <span className="font-semibold">{page}</span> of{" "}
          <span className="font-semibold">{totalPages}</span>
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="btn btn-outline pagination-btn"
          aria-label="Next page"
        >
          Next &rarr;
        </button>
      </div>
    </nav>
  );
}
