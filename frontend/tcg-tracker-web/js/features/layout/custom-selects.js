export function createCustomSelectController({ documentRef = document, windowRef = window } = {}) {
  function initCustomSelects() {
    const nativeSelects = Array.from(documentRef.querySelectorAll('select'));
    if (!nativeSelects.length) return;

    const closeAll = (except = null) => {
      documentRef.querySelectorAll('.custom-select.is-open').forEach((node) => {
        if (node !== except) {
          node.classList.remove('is-open');
          node.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
    };

    const applyTriggerSelectionState = (button, selectedNode = null) => {
      const isNotImported = selectedNode?.dataset.imported === 'false';
      button.classList.toggle('is-not-imported', isNotImported);
      if (isNotImported) button.dataset.imported = 'false';
      else button.removeAttribute('data-imported');
    };

    const createOptionNode = ({ option, select, list, button, root }) => {
      const item = documentRef.createElement('button');
      item.type = 'button';
      item.className = 'custom-select-option';
      item.dataset.value = option.value;
      const isNotImported = option.dataset.imported === 'false';
      const rawLabel = option.textContent?.trim() || '—';
      const visibleLabel = isNotImported
        ? rawLabel.replace(/\s*[·-]\s*noch nicht importiert$/i, '').trim()
        : rawLabel;
      item.textContent = visibleLabel || rawLabel;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));

      if (option.dataset.imported) item.dataset.imported = option.dataset.imported;
      if (isNotImported) {
        item.classList.add('is-not-imported');
        item.title = 'Noch nicht importiert';
      }

      if (option.disabled) {
        item.disabled = true;
        item.classList.add('is-disabled');
      }

      if (option.selected) {
        item.classList.add('is-selected');
        button.textContent = item.textContent;
        applyTriggerSelectionState(button, item);
      }

      item.addEventListener('click', () => {
        if (option.disabled) return;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        root.classList.remove('is-open');
        button.focus();
      });

      list.appendChild(item);
    };

    nativeSelects.forEach((select) => {
      if (select.closest('.custom-select')) return;
      if (select.dataset.customized === 'true') return;

      select.dataset.customized = 'true';
      select.classList.add('cs-native');

      const root = documentRef.createElement('div');
      root.className = 'custom-select';
      if (select.className) {
        select.className.split(' ').filter(Boolean).forEach((className) => root.classList.add(`from-${className}`));
      }
      if (select.id) root.classList.add(`from-id-${select.id}`);

      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'custom-select-trigger';
      button.setAttribute('aria-haspopup', 'listbox');
      button.setAttribute('aria-expanded', 'false');
      button.disabled = select.disabled;

      const list = documentRef.createElement('div');
      list.className = 'custom-select-list';
      list.setAttribute('role', 'listbox');

      const rebuild = () => {
        list.innerHTML = '';
        button.textContent = '';
        const options = Array.from(select.options);
        options.forEach((option) => createOptionNode({ option, select, list, button, root }));
        if (!button.textContent) {
          const selectedOption = options.find((option) => option.selected) || options[0];
          button.textContent = selectedOption?.textContent?.trim() || 'Auswählen…';
        }
        button.disabled = select.disabled;
        root.classList.toggle('is-disabled', Boolean(select.disabled));
      };

      const syncSelectionState = () => {
        const selectedValue = select.value;
        let selectedNode = null;
        list.querySelectorAll('.custom-select-option').forEach((optionNode) => {
          const isSelected = optionNode.dataset.value === selectedValue;
          optionNode.classList.toggle('is-selected', isSelected);
          optionNode.setAttribute('aria-selected', String(isSelected));
          if (isSelected) {
            selectedNode = optionNode;
            button.textContent = optionNode.textContent || 'Auswählen…';
          }
        });
        applyTriggerSelectionState(button, selectedNode);
        button.disabled = select.disabled;
        root.classList.toggle('is-disabled', Boolean(select.disabled));
      };

      const toggleDropdownOpen = () => {
        if (button.disabled) return;
        const shouldOpen = !root.classList.contains('is-open');
        closeAll(root);
        root.classList.toggle('is-open', shouldOpen);
        button.setAttribute('aria-expanded', String(shouldOpen));
        if (shouldOpen) {
          const selectedNode = list.querySelector('.custom-select-option.is-selected');
          if (selectedNode) {
            const optionTop = selectedNode.offsetTop;
            const optionBottom = optionTop + selectedNode.offsetHeight;
            const viewTop = list.scrollTop;
            const viewBottom = viewTop + list.clientHeight;
            if (optionTop < viewTop) list.scrollTop = optionTop;
            else if (optionBottom > viewBottom) list.scrollTop = optionBottom - list.clientHeight;
          }
        }
      };

      button.addEventListener('click', (event) => {
        if (button.disabled) return;
        event.preventDefault();
        toggleDropdownOpen();
      });

      button.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          root.classList.remove('is-open');
          button.setAttribute('aria-expanded', 'false');
        }
        if ((event.key === 'Enter' || event.key === ' ') && !root.classList.contains('is-open')) {
          event.preventDefault();
          toggleDropdownOpen();
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const enabled = Array.from(select.options).filter((option) => !option.disabled);
          if (!enabled.length) return;
          const currentIndex = enabled.findIndex((option) => option.value === select.value);
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          const nextIndex = currentIndex < 0
            ? 0
            : (currentIndex + delta + enabled.length) % enabled.length;
          select.value = enabled[nextIndex].value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      select.addEventListener('change', syncSelectionState);

      const observer = new MutationObserver(() => {
        rebuild();
        syncSelectionState();
      });
      observer.observe(select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'selected', 'label', 'value'],
      });

      select.parentNode?.insertBefore(root, select);
      root.appendChild(select);
      root.appendChild(button);
      root.appendChild(list);
      rebuild();
      syncSelectionState();
    });

    documentRef.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) {
        closeAll();
        return;
      }
      if (!event.target.closest('.custom-select')) {
        closeAll();
        documentRef.querySelectorAll('.custom-select-trigger[aria-expanded="true"]').forEach((button) => {
          button.setAttribute('aria-expanded', 'false');
        });
      }
    });

    windowRef.addEventListener('scroll', () => {
      closeAll();
    }, { passive: true });
  }

  return {
    initCustomSelects,
  };
}
