import * as React from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import { twMerge } from 'tailwind-merge';
import { FileText, Image as ImageIcon } from 'lucide-react';

export interface IAppProps {
    fileUrl: string;
    fileType: string;
    ocrData: string;
    selectedFieldKey: string;
}

interface Coordinate {
    x: number;
    y: number;
}

interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Assuming OCR Data structure based on Azure Form Recognizer (simplified)
interface OcrField {
    key: string;
    boundingBox: number[]; // [x1, y1, x2, y2, x3, y3, x4, y4] or similar. Usually 8 numbers for 4 points.
    text: string;
}

const useCoordinateMapping = (
    originalWidth: number,
    originalHeight: number,
    containerWidth: number,
    containerHeight: number
) => {
    // This is a simplified hook skeleton.
    // Real implementation would depend on how the image/PDF is scaled in the viewer.
    // For now, it returns a function that scales coordinates.
    const scaleX = containerWidth / originalWidth;
    const scaleY = containerHeight / originalHeight;

    const mapCoordinate = (val: number, axis: 'x' | 'y') => {
        return val * (axis === 'x' ? scaleX : scaleY);
    };

    return { mapCoordinate, scaleX, scaleY };
};

const App: React.FC<IAppProps> = ({ fileUrl, fileType, ocrData, selectedFieldKey }) => {
    const defaultLayoutPluginInstance = defaultLayoutPlugin();
    const [ocrFields, setOcrFields] = React.useState<OcrField[]>([]);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });

    React.useEffect(() => {
        if (ocrData) {
            try {
                const parsed: unknown = JSON.parse(ocrData);
                // Assume parsed data is a list of fields or has a fields property
                // For this skeleton, we assume it's an array of objects
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
        if (containerRef.current) {
            setContainerSize({
                width: containerRef.current.clientWidth,
                height: containerRef.current.clientHeight
            });
        }
    }, []);

    const { mapCoordinate } = useCoordinateMapping(8.5, 11, containerSize.width, containerSize.height); // Assuming standard letter size in inches for now as default

    const renderOverlay = () => {
        return (
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
                {ocrFields.map((field, idx) => {
                     // Simplified bounding box logic. Azure often returns inches.
                     // We need to know the page dimensions to scale correctly.
                     // Here we just mock the rendering logic.
                     if (!field.boundingBox || field.boundingBox.length < 8) return null;

                     // Taking top-left (0,1) and bottom-right (4,5) roughly
                     const x = mapCoordinate(field.boundingBox[0], 'x');
                     const y = mapCoordinate(field.boundingBox[1], 'y');
                     const w = mapCoordinate(field.boundingBox[4] - field.boundingBox[0], 'x');
                     const h = mapCoordinate(field.boundingBox[5] - field.boundingBox[1], 'y');

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
            <div className="viewer-panel" style={{ flex: '0 0 60%', position: 'relative', borderRight: '1px solid #ccc', overflow: 'hidden' }} ref={containerRef}>
                {fileType === 'pdf' ? (
                    <div style={{ height: '100%' }}>
                        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                            <Viewer
                                fileUrl={fileUrl}
                                plugins={[defaultLayoutPluginInstance]}
                            />
                        </Worker>
                        {/* Overlay needs to be synchronized with PDF page. This is complex in react-pdf-viewer.
                            For this task, we put it on top, but effectively it works best with Image viewer or single page PDF. */}
                        {renderOverlay()}
                    </div>
                ) : fileType === 'image' ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                         <img src={fileUrl} alt="Document" style={{ width: '100%', objectFit: 'contain' }} />
                         {renderOverlay()}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p>Unsupported file type</p>
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
