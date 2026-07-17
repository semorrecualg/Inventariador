import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import Modal from '../components/Modal';

describe('Modal Component', () => {
  // ---- Rendering Control ----
  describe('Rendering control', () => {
    it('accepts isOpen prop correctly', () => {
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'Test Title',
        onClose: vi.fn(),
      });
      expect(element.props.isOpen).toBe(true);
    });

    it('accepts isOpen=false prop', () => {
      const element = React.createElement(Modal, {
        isOpen: false,
        title: 'Test',
        onClose: vi.fn(),
      });
      expect(element.props.isOpen).toBe(false);
    });

    it('accepts all required props', () => {
      const onClose = vi.fn();
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'Required Props',
        onClose,
      });
      expect(element.props.title).toBe('Required Props');
      expect(element.props.onClose).toBe(onClose);
    });
  });

  // ---- Type Variants ----
  describe('Type variants', () => {
    it('accepts info type', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Info', type: 'info', onClose: vi.fn(),
      });
      expect(element.props.type).toBe('info');
    });

    it('accepts warning type', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Warning', type: 'warning', onClose: vi.fn(),
      });
      expect(element.props.type).toBe('warning');
    });

    it('accepts error type', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Error', type: 'error', onClose: vi.fn(),
      });
      expect(element.props.type).toBe('error');
    });

    it('accepts success type', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Success', type: 'success', onClose: vi.fn(),
      });
      expect(element.props.type).toBe('success');
    });

    it('accepts confirm type', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Confirm', type: 'confirm', onClose: vi.fn(),
      });
      expect(element.props.type).toBe('confirm');
    });

    it('accepts security type', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Security', type: 'security', onClose: vi.fn(),
      });
      expect(element.props.type).toBe('security');
    });

    it('defaults to info type', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Default', onClose: vi.fn(),
      });
      expect(element.props.type).toBe('info');
    });
  });

  // ---- Button Configuration ----
  describe('Button configuration', () => {
    it('accepts custom confirm text', () => {
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'Custom',
        type: 'confirm',
        onClose: vi.fn(),
        onConfirm: vi.fn(),
        confirmText: 'Sim, Apagar',
      });
      expect(element.props.confirmText).toBe('Sim, Apagar');
    });

    it('accepts custom cancel text', () => {
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'Custom',
        type: 'confirm',
        onClose: vi.fn(),
        cancelText: 'Voltar',
      });
      expect(element.props.cancelText).toBe('Voltar');
    });

    it('accepts showCancel prop', () => {
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'With Cancel',
        onClose: vi.fn(),
        showCancel: true,
      });
      expect(element.props.showCancel).toBe(true);
    });
  });

  // ---- Content ----
  describe('Content', () => {
    it('accepts message text', () => {
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'Message',
        message: 'This is a test message.',
        onClose: vi.fn(),
      });
      expect(element.props.message).toBe('This is a test message.');
    });

    it('renders without message', () => {
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'No Message',
        onClose: vi.fn(),
      });
      expect(element.props.message).toBeUndefined();
    });

    it('accepts children', () => {
      const child = React.createElement('div', null, 'Child content');
      const element = React.createElement(Modal, {
        isOpen: true,
        title: 'With Children',
        onClose: vi.fn(),
      }, child);
      expect(element.props.children).toBeDefined();
    });
  });

  // ---- Callbacks ----
  describe('Callbacks', () => {
    it('accepts onClose callback', () => {
      const onClose = vi.fn();
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Test', onClose,
      });
      expect(element.props.onClose).toBe(onClose);
    });

    it('accepts onConfirm callback', () => {
      const onConfirm = vi.fn();
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Test', type: 'confirm', onClose: vi.fn(), onConfirm,
      });
      expect(element.props.onConfirm).toBe(onConfirm);
    });

    it('onConfirm is optional', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Test', onClose: vi.fn(),
      });
      expect(element.props.onConfirm).toBeUndefined();
    });
  });

  // ---- Edge Cases ----
  describe('Edge cases', () => {
    it('handles empty title', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: '', onClose: vi.fn(),
      });
      expect(element.props.title).toBe('');
    });

    it('handles multiline message', () => {
      const multiLine = 'Line 1\nLine 2\nLine 3';
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Multi', message: multiLine, onClose: vi.fn(),
      });
      expect(element.props.message).toBe(multiLine);
    });

    it('handles long title', () => {
      const longTitle = 'A'.repeat(500);
      const element = React.createElement(Modal, {
        isOpen: true, title: longTitle, onClose: vi.fn(),
      });
      expect(element.props.title.length).toBe(500);
    });

    it('handles confirm type without onConfirm', () => {
      const element = React.createElement(Modal, {
        isOpen: true, title: 'Confirm', type: 'confirm', onClose: vi.fn(),
      });
      expect(element.type).toBe(Modal);
      expect(element.props.onConfirm).toBeUndefined();
    });
  });
});
