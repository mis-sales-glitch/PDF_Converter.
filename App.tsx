import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generatePdfFromImages } from './services/pdfService';
import { upscaleImage } from './services/geminiService';
import { ImageIcon, DownloadIcon, ErrorIcon, CheckCircleIcon, TrashIcon } from './components/Icons';

interface ManagedImage {
  id: string;
  file: File;
  previewUrl: string;
  status: 'upscaling' | 'ready' | 'error';
  errorMessage?: string;
}

const App: React.FC = () => {
  const [managedImages, setManagedImages] = useState<ManagedImage[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // This effect hook handles cleaning up object URLs when the component unmounts to prevent memory leaks.
  useEffect(() => {
    return () => {
        managedImages.forEach(image => URL.revokeObjectURL(image.previewUrl));
    }
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const pastedImages: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const extension = blob.type.split('/')[1] || 'png';
            const fileName = `pasted-image-${Date.now()}-${i}.${extension}`;
            const file = new File([blob], fileName, { type: blob.type });
            pastedImages.push(file);
          }
        }
      }

      if (pastedImages.length > 0) {
        setSuccessMessage(`${pastedImages.length} image(s) pasted. Upscaling...`);
        setError(null);
        
        const newEntries: ManagedImage[] = pastedImages.map(file => ({
            id: `${file.name}-${Math.random()}`,
            file: file,
            previewUrl: URL.createObjectURL(file),
            status: 'upscaling',
        }));

        setManagedImages(prev => [...prev, ...newEntries]);

        newEntries.forEach(entry => {
            upscaleImage(entry.file)
                .then(upscaledFile => {
                    const newPreviewUrl = URL.createObjectURL(upscaledFile);
                    setManagedImages(prev => prev.map(img => {
                        if (img.id === entry.id) {
                            URL.revokeObjectURL(img.previewUrl); // Revoke old preview
                            return { ...img, file: upscaledFile, previewUrl: newPreviewUrl, status: 'ready' };
                        }
                        return img;
                    }));
                    setSuccessMessage('Image upscaling complete!');
                })
                .catch(err => {
                    console.error('Upscaling failed for', entry.file.name, err);
                    setManagedImages(prev => prev.map(img =>
                        img.id === entry.id ? { ...img, status: 'error', errorMessage: 'Upscaling failed.' } : img
                    ));
                    setError('Some images could not be upscaled.');
                });
        });
      }
    };

    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMessage(null);
    if (event.target.files) {
      const validImages = Array.from(event.target.files).filter(file => file.type.startsWith('image/'));
      if (validImages.length !== event.target.files.length) {
        setError("Some selected files were not valid images and have been ignored.");
      }
      
      const newEntries: ManagedImage[] = validImages.map(file => ({
        id: `${file.name}-${Math.random()}`,
        file: file,
        previewUrl: URL.createObjectURL(file),
        status: 'ready'
      }));

      setManagedImages(prev => [...prev, ...newEntries]);

      if (validImages.length > 0) {
        setSuccessMessage(`${validImages.length} image(s) selected.`);
      }
    }
  };

  const handleGeneratePdf = async () => {
    const imagesToProcess = managedImages
        .filter(img => img.status === 'ready')
        .map(img => img.file);
        
    if (imagesToProcess.length === 0) {
      setError("Please add at least one ready image. If images are upscaling, please wait.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await generatePdfFromImages(imagesToProcess);
      setSuccessMessage("PDF generated successfully!");
    } catch (e: any) {
      setError(`Failed to generate PDF: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleClearImages = () => {
    managedImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
    setManagedImages([]);
    setError(null);
    setSuccessMessage(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  }

  const handleRemoveImage = (idToRemove: string) => {
    setManagedImages(prev => {
        const imageToRemove = prev.find(img => img.id === idToRemove);
        if (imageToRemove) {
            URL.revokeObjectURL(imageToRemove.previewUrl);
        }
        return prev.filter(img => img.id !== idToRemove);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans">
      <main className="container mx-auto px-4 py-8 sm:py-12 flex flex-col items-center gap-8">
        <header className="text-center">
          <div className="inline-flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-full mb-4">
            <ImageIcon className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white">
            Image to PDF Converter
          </h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Easily convert images into a single PDF. Pasted images are automatically upscaled for better quality.
          </p>
        </header>

        <div className="w-full max-w-2xl">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg cursor-pointer bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <ImageIcon className="w-10 h-10 mb-3 text-slate-400" />
                <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">Click to upload</span>, drag &amp; drop, or paste
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG, GIF, etc.</p>
              </div>
            </label>
        </div>

        {error && (
          <div className="w-full max-w-4xl p-4 bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-200 rounded-lg flex items-start gap-3">
            <ErrorIcon className="w-5 h-5 mt-0.5 flex-shrink-0"/>
            <p>{error}</p>
          </div>
        )}

        {successMessage && !error && (
          <div className="w-full max-w-4xl p-4 bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700 text-green-800 dark:text-green-200 rounded-lg flex items-start gap-3">
            <CheckCircleIcon className="w-5 h-5 mt-0.5 flex-shrink-0"/>
            <p>{successMessage}</p>
          </div>
        )}

        {managedImages.length > 0 && (
          <div className="w-full max-w-4xl flex flex-col gap-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 bg-white dark:bg-slate-800 shadow-lg rounded-xl border border-slate-200 dark:border-slate-700">
              {managedImages.map((image) => (
                <div key={image.id} className="relative group aspect-square rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700">
                  <img src={image.previewUrl} alt={`Preview of ${image.file.name}`} className="w-full h-full object-cover" />
                  
                  {image.status === 'upscaling' && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white p-2">
                        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-xs mt-2 font-semibold">Upscaling...</p>
                    </div>
                  )}

                  {image.status === 'error' && (
                    <div className="absolute inset-0 bg-red-900/80 flex flex-col items-center justify-center text-white p-2 text-center">
                        <ErrorIcon className="w-8 h-8 text-red-300"/>
                        <p className="text-xs mt-2 font-semibold">{image.errorMessage || 'An error occurred'}</p>
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-4 text-white text-xs">
                    <p className="truncate">{image.file.name}</p>
                  </div>

                  <button 
                    onClick={() => handleRemoveImage(image.id)}
                    aria-label={`Remove ${image.file.name}`}
                    className="absolute top-2 right-2 bg-black/40 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-500"
                  >
                    <TrashIcon className="w-4 h-4"/>
                  </button>
                </div>
              ))}
            </div>

             <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleGeneratePdf}
                  disabled={isGenerating || managedImages.some(img => img.status === 'upscaling')}
                  className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-900 transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <DownloadIcon className="w-5 h-5" />
                      Generate PDF
                    </>
                  )}
                </button>
                 <button
                  onClick={handleClearImages}
                  className="w-full sm:w-auto px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 dark:focus:ring-offset-slate-900 transition-colors duration-200 flex items-center justify-center gap-2"
                >
                    <TrashIcon className="w-5 h-5"/>
                    Clear
                </button>
             </div>
          </div>
        )}
      </main>
      <footer className="text-center py-6 text-sm text-slate-500 dark:text-slate-400">
        <p>Powered by React, Tailwind CSS, jsPDF, and Gemini.</p>
      </footer>
    </div>
  );
};

export default App;