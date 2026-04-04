import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface ListEditorProps {
  title: string;
  description: string;
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder?: string;
}

export function ListEditor({ title, description, items, onAdd, onRemove, placeholder }: ListEditorProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !items.includes(inputValue.trim())) {
      onAdd(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{description}</p>
      
      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder || "Add item..."}
          className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 text-sm rounded-md focus:ring-purple-500 focus:border-purple-500 block w-full p-2"
        />
        <button
          type="submit"
          disabled={!inputValue.trim()}
          className="p-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={16} />
        </button>
      </form>

      {items.length > 0 ? (
        <ul className="space-y-2 max-h-40 overflow-y-auto pr-2">
          {items.map((item) => (
            <li key={item} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md border border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate mr-2">{item}</span>
              <button
                onClick={() => onRemove(item)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No items added yet.</p>
      )}
    </div>
  );
}
