import * as React from 'react';
import { Viewer, Worker, DocumentLoadEvent, LoadError } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import { twMerge } from 'tailwind-merge';

export interface IAppProps {
    fileUrl: string;
    fileType: string;
    ocrData: string;
    selectedFieldKey: string;
}

// Assumed simplified OCR structure
interface OcrField {
    key: string;
    boundingBox: number[];
    text: string;
    page?: number;
}

// Hook to handle coordinate mapping from Original (Inch/Pixel) -> Rendered (Pixel)
const useCoordinateMapping = () => {
    // scaleX = renderedWidth / originalWidth
    // scaleY = renderedHeight / originalHeight
    const calcScale = (
        originalW: number,
        originalH: number,
        renderedW: number,
        renderedH: number
    ) => {
        if (originalW === 0 || originalH === 0) return { x: 1, y: 1 };
        return {
            x: renderedW / originalW,
            y: renderedH / originalH
        };
    };

    return { calcScale };
};

const App: React.FC<IAppProps> = ({ fileUrl, fileType, ocrData, selectedFieldKey }) => {
    const defaultLayoutPluginInstance = defaultLayoutPlugin();
    const [ocrFields, setOcrFields] = React.useState<OcrField[]>([]);

    // Scaling state
    const [originalSize, setOriginalSize] = React.useState({ width: 0, height: 0 });
    const [renderedSize, setRenderedSize] = React.useState({ width: 0, height: 0 });
    const [loadError, setLoadError] = React.useState<string | null>(null);

    // Resize observer for the container or image
    const containerRef = React.useRef<HTMLDivElement>(null);
    const imgRef = React.useRef<HTMLImageElement>(null);

    const { calcScale } = useCoordinateMapping();

    React.useEffect(() => {
        if (ocrData) {
            try {
                const parsed: unknown = JSON.parse(ocrData);
                if (Array.isArray(parsed)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
                    setOcrFields(parsed as any);
                }
            } catch (e) {
                console.error("Failed to parse OCR data", e);
            }
        }
    }, [ocrData]);

    React.useEffect(() => {
        // Observe container resize to update rendered dimensions
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                // For PDF viewer, the container size determines the viewport size if "fit to width" etc.
                // But for Image with object-fit:contain, we need the actual image rendered size.
                // If it's PDF, we usually rely on page load events or assume full width.
                // Here we just track container for basic responsive updates.
                if (fileType === 'pdf') {
                   // For PDF, scaling is handled by internal viewer state (zoom).
                   // We might need a more complex interaction to get current zoom level.
                   // For this skeleton, we just ensure we re-render if container changes.
                   setRenderedSize({ width, height });
                }
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [fileType]);

    // Handle Image Load
    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight });
        setRenderedSize({ width: img.clientWidth, height: img.clientHeight });
        setLoadError(null);
    };

    // Handle Image Error
    const handleImageError = () => {
        setLoadError("Failed to load image. Check Storage CORS settings or URL validity.");
    };

    // Handle PDF Load
    const handleDocumentLoad = (e: DocumentLoadEvent) => {
        // e.doc.getPage(1).then(...) could get original size in points.
        // For simplicity in this skeleton, we assume a standard letter size or use the first page's viewport if accessible.
        // We will default to 8.5 x 11 inches * 72 DPI = 612 x 792 points if unknown.
        setLoadError(null);

        // Try to get first page dimensions (async)
        // eslint-disable-next-line promise/catch-or-return
        void e.doc.getPage(1).then(page => {
            // view contains [x, y, w, h]
             const viewport = page.getViewport({ scale: 1 });
             setOriginalSize({ width: viewport.width, height: viewport.height });
             return null;
        });
    };

    // Handle PDF Error
    const renderPdfError = (e: LoadError) => {
        let msg = "Failed to load PDF.";
        if (e.name === 'MissingPDFException') {
            msg = "PDF source is missing.";
        } else if (e.name === 'InvalidPDFException') {
            msg = "Invalid PDF file.";
        } else {
             // CORS often manifests as generic network error or specific Access issues
             msg = "Error loading PDF. Please check Storage CORS configuration.";
        }

        // We can either set state or return the UI directly.
        // Returning UI directly is cleaner for the Viewer prop.
        return (
            <div className="flex items-center justify-center h-full bg-red-50 p-4 text-center">
                <div className="text-red-600 font-semibold">{msg}</div>
            </div>
        );
    };

    const renderOverlay = () => {
        if (originalSize.width === 0 || originalSize.height === 0) return null;

        // If Image, renderedSize is from the img element (clientW/H).
        // If PDF, renderedSize is from the container (which might not match zoom).
        // For PDF, accurate overlay requires hooking into the page layer or knowing exact zoom.
        // In this simplified 'Workbench', we assume 'Fit Width' or similar for PDF or just map to container for now.
        // For Image, this logic is quite accurate.

        const currentRenderedW = fileType === 'image' && imgRef.current ? imgRef.current.clientWidth : renderedSize.width;
        const currentRenderedH = fileType === 'image' && imgRef.current ? imgRef.current.clientHeight : renderedSize.height;

        const { x: scaleX, y: scaleY } = calcScale(originalSize.width, originalSize.height, currentRenderedW, currentRenderedH);

        return (
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
                {ocrFields.map((field, idx) => {
                     if (!field.boundingBox || field.boundingBox.length < 8) return null;

                     // Assuming boundingBox is [x1, y1, x2, y2, x3, y3, x4, y4] (Inches for PDF usually, Pixels for Image)
                     // If PDF and originalSize was set from Points (72 DPI), and boundingBox is Inches:
                     // We need to normalize.
                     // Let's assume input OCR data matches the 'originalSize' unit we detected (or is normalized).
                     // If OCR is inches and PDF is points: 1 inch = 72 points.
                     // A robust real-world app needs unit conversion here.
                     // For this skeleton, we apply the calculated scale factor directly.

                     // Simple rect from p1 (top-left) and p3 (bottom-right)
                     const bx = field.boundingBox[0];
                     const by = field.boundingBox[1];
                     // Azure returns 8 points. 3rd point pair is bottom right usually?
                     // [x1,y1 (TL), x2,y2 (TR), x3,y3 (BR), x4,y4 (BL)]
                     const bw = field.boundingBox[4] - field.boundingBox[0];
                     const bh = field.boundingBox[5] - field.boundingBox[1];

                     // Apply Scale
                     const x = bx * scaleX;
                     const y = by * scaleY;
                     const w = bw * scaleX;
                     const h = bh * scaleY;

                     const isSelected = field.key === selectedFieldKey;

                     return (
                         <rect
                            key={idx}
                            x={x}
                            y={y}
                            width={w}
                            height={h}
                            fill={isSelected ? 'rgba(255, 255, 0, 0.3)' : 'transparent'}
                            stroke={isSelected ? 'blue' : 'red'}
                            strokeWidth={2}
                         />
                     );
                })}
            </svg>
        );
    };

    return (
        <div className={twMerge("flex h-full w-full", "daom-workbench")} style={{ display: 'flex', height: '100%', width: '100%' }}>
            {/* Left Panel: Viewer (60%) */}
            <div className="viewer-panel" style={{ flex: '0 0 60%', position: 'relative', borderRight: '1px solid #ccc', overflow: 'hidden', backgroundColor: '#f0f0f0' }} ref={containerRef}>
                {loadError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-50 p-4 text-center">
                        <div className="text-red-600 font-semibold">
                            {loadError}
                        </div>
                    </div>
                )}

                {fileType === 'pdf' ? (
                    <div style={{ height: '100%', overflow: 'hidden' }}>
                        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                            <Viewer
                                fileUrl={fileUrl} // SAS token URL works directly here
                                plugins={[defaultLayoutPluginInstance]}
                                onDocumentLoad={handleDocumentLoad}
                                renderError={renderPdfError}
                                // react-pdf-viewer uses virtualization (lazy loading) by default.
                                // We don't need to explicitly enable it, but we should avoid props that disable it.
                            />
                        </Worker>
                        {/* Overlay for PDF is tricky without custom page renderer.
                            This SVG will sit on top of the scrolling viewport.
                            Ideally, we'd inject it into the page layer.
                            For now, this demonstrates the scaling logic requested. */}
                        {renderOverlay()}
                    </div>
                ) : fileType === 'image' ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                         <img
                            ref={imgRef}
                            src={fileUrl}
                            alt="Document"
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                            onLoad={handleImageLoad}
                            onError={handleImageError}
                         />
                         {/* Overlay needs to wrap or match the img position.
                             If object-fit is used, the image might not fill the div.
                             The renderOverlay uses logic relative to the 'rendered' size of the image itself.
                             However, to position absolute correctly, the SVG needs to overlay the IMAGE, not the container,
                             or we need to offset.
                             For simplicity, we assume the SVG is 100% of container, but we might need to center it if image is centered.
                             A better approach for Image is to wrap img and svg in a shared div that fits the content.
                          */}
                         {originalSize.width > 0 && (
                            <div style={{
                                position: 'absolute',
                                width: imgRef.current?.clientWidth,
                                height: imgRef.current?.clientHeight,
                                pointerEvents: 'none'
                            }}>
                                {renderOverlay()}
                            </div>
                         )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p>Unsupported file type: {fileType}</p>
                    </div>
                )}
            </div>

            {/* Right Panel: Data Verification List (40%) */}
            <div className="data-panel" style={{ flex: '0 0 40%', padding: '1rem', overflowY: 'auto' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Data Verification</h2>
                <div className="space-y-4">
                    {ocrFields.map((field, idx) => (
                        <div
                            key={idx}
                            className={twMerge("p-2 border rounded cursor-pointer", field.key === selectedFieldKey ? "bg-blue-100 border-blue-500" : "bg-white border-gray-200")}
                        >
                            <div className="font-semibold text-sm text-gray-600">{field.key}</div>
                            <div className="text-lg">{field.text}</div>
                        </div>
                    ))}
                    {ocrFields.length === 0 && <p className="text-gray-500">No OCR data available.</p>}
                </div>
            </div>
        </div>
    );
};

export default App;
