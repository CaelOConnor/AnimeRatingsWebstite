import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import './FeedbackModal.css';

const COPY = {
  show_request: {
    title: 'Request a show',
    placeholder: 'Which anime would you like to see added?',
  },
  bug_report: {
    title: 'Report a bug',
    placeholder: 'What went wrong?',
  },
};

const MAX_LENGTH = 1000;

// Small single-field modal shared by the navbar's "Request a show" and
// "Report a bug" buttons — same UI, different `type` sent to the backend.
export default function FeedbackModal({ isOpen, type, onClose }) {
  const [content, setContent] = useState('');
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving]   = useState(false);

  const textareaRef = useRef(null);
  const overlayRef  = useRef(null);

  // Focus the textarea on open; reset all form state on close.
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 60);
    } else {
      setContent('');
      setError('');
      setSuccess(false);
      setSaving(false);
    }
  }, [isOpen]);

  // Allow the user to close the modal by pressing Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Prevent the page behind the modal from scrolling while it's open.
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen || !type) return null;

  const copy = COPY[type];

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Please enter some text before submitting.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      await api.post('/api/feedback', { type, content: trimmed });
      setContent('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="feedback-modal__overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
    >
      <div className="feedback-modal">
        <div className="feedback-modal__header">
          <h2 className="feedback-modal__title">{copy.title}</h2>
        </div>

        <button onClick={onClose} className="feedback-modal__close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <form onSubmit={handleSubmit} className="feedback-modal__form" noValidate>
          <textarea
            ref={textareaRef}
            className="feedback-modal__textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={copy.placeholder}
            maxLength={MAX_LENGTH}
            rows={4}
          />
          <span className="feedback-modal__count">{content.length}/{MAX_LENGTH}</span>

          {error && <p className="feedback-modal__error">{error}</p>}
          {success && <p className="feedback-modal__success">Thanks, got it!</p>}

          <button type="submit" disabled={saving} className="feedback-modal__submit">
            {saving ? 'Submitting…' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
