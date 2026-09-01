import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import type { Course, Lesson, PromptTemplate } from '../lib/firebase';
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    query,
    where,
    writeBatch
} from 'firebase/firestore';
import { Upload, FileText, LogOut, Settings as SettingsIcon, Loader, Trash2, Download, BookOpen } from 'lucide-react';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import './Dashboard.css';

export default function Dashboard() {
    const { user, userProfile, signOut } = useAuth();
    const navigate = useNavigate();
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchCourses();
    }, []);

    async function fetchCourses() {
        try {
            const coursesRef = collection(db, 'courses');
            const snapshot = await getDocs(coursesRef);
            const coursesList: Course[] = snapshot.docs.map(docSnapshot => ({
                id: docSnapshot.id,
                ...(docSnapshot.data() as Omit<Course, 'id'>)
            }));

            // Sort newest first
            coursesList.sort((a, b) => {
                const dateA = new Date(a.created_at || 0).getTime();
                const dateB = new Date(b.created_at || 0).getTime();
                return dateB - dateA;
            });

            setCourses(coursesList);
        } catch (error) {
            console.error('Error fetching courses:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);

        try {
            // Parse DOCX file
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            let fullText = result.value;

            // Clean up text: remove excessive newlines caused by images
            fullText = fullText.replace(/\n\s*\n\s*\n+/g, '\n');
            fullText = fullText.split('\n').map(line => line.trim()).join('\n');

            // Extract course title from first line of document (not filename)
            const firstLine = fullText.split('\n')[0].trim();
            const courseTitle = firstLine || file.name.replace('.docx', '').replace(/_/g, ' ');

            // Split into sections
            const sections: string[] = [];
            const patterns = [
                { regex: /Módulo:\s*\d+\.\d+/gi, name: 'Módulo: X.Y' },
                { regex: /Módulo\s+\d+:/gi, name: 'Módulo X:' },
            ];

            let matches: RegExpMatchArray[] = [];
            for (const pattern of patterns) {
                const found = Array.from(fullText.matchAll(pattern.regex));
                if (found.length > 0) {
                    matches = found;
                    break;
                }
            }

            if (matches.length === 0) {
                sections.push(fullText.trim());
            } else {
                const firstModuleIndex = matches[0].index!;
                if (firstModuleIndex > 100) {
                    const intro = fullText.substring(0, firstModuleIndex).trim();
                    sections.push(intro);
                }

                for (let i = 0; i < matches.length; i++) {
                    const startIndex = matches[i].index!;
                    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : fullText.length;
                    const moduleContent = fullText.substring(startIndex, endIndex).trim();

                    if (moduleContent.length > 1000) {
                        sections.push(moduleContent);
                    }
                }
            }

            // Create course in Firestore
            const newCourseData = {
                user_id: user?.uid || 'anonymous',
                title: courseTitle,
                created_at: new Date().toISOString(),
            };

            const courseDocRef = await addDoc(collection(db, 'courses'), newCourseData);

            // Fetch prompt templates from Firestore
            const templatesSnapshot = await getDocs(collection(db, 'prompt_templates'));
            const templates: PromptTemplate[] = templatesSnapshot.docs.map(d => ({
                id: d.id,
                ...(d.data() as Omit<PromptTemplate, 'id'>)
            }));

            const defaultTemplate = `Papel: Atue como um instrutor experiente e didático. O tom deve ser de uma aula formal, mas acessível.

Estrutura da Aula:

Introdução Obrigatória: Inicie EXATAMENTE com a frase: "Nesse curso vamos aprender sobre: {course_title}"

Logo em seguida, instrua o aluno a pegar a apostila para acompanhar o conteúdo visualmente enquanto ouve.

Conteúdo da Aula: {lesson_content}

Conclusão Obrigatória: Encerre a aula EXATAMENTE com a frase: "Obrigado por ficar até aqui e te vejo na próxima aula."

Instruções Adicionais: Foque em explicar com clareza.`;

            const userId = user?.uid;
            const userFirst = templates.find((t) => t.template_type === 'first' && t.user_id === userId);
            const systemFirst = templates.find((t) => t.template_type === 'first' && !t.user_id);
            const firstTemplate = (userFirst || systemFirst)?.template || defaultTemplate;

            const userMiddle = templates.find((t) => t.template_type === 'middle' && t.user_id === userId);
            const systemMiddle = templates.find((t) => t.template_type === 'middle' && !t.user_id);
            const middleTemplate = (userMiddle || systemMiddle)?.template || defaultTemplate;

            const userLast = templates.find((t) => t.template_type === 'last' && t.user_id === userId);
            const systemLast = templates.find((t) => t.template_type === 'last' && !t.user_id);
            const lastTemplate = (userLast || systemLast)?.template || defaultTemplate;

            // Batch insert lessons into Firestore
            const batch = writeBatch(db);
            const lessonsCol = collection(db, 'lessons');

            sections.forEach((content, index) => {
                let template = middleTemplate;
                if (index === 0) template = firstTemplate;
                if (index === sections.length - 1) template = lastTemplate;

                let moduleMatch = content.match(/Módulo:\s*\d+\.\d+\s*(.+)/i);
                if (!moduleMatch) {
                    moduleMatch = content.match(/Módulo\s+\d+:\s*(.+)/i);
                }
                const lessonTitle = moduleMatch ? moduleMatch[1].split('\n')[0].trim() : `Aula ${index + 1}`;

                const prompt = template
                    .replace(/\{course_title\}/g, courseTitle)
                    .replace(/\{lesson_content\}/g, lessonTitle)
                    .replace(/\{aula\}/g, (index + 1).toString());

                const newLessonRef = doc(lessonsCol);
                batch.set(newLessonRef, {
                    course_id: courseDocRef.id,
                    original_content: content,
                    edited_content: content,
                    prompt,
                    lesson_order: index + 1,
                    created_at: new Date().toISOString(),
                });
            });

            await batch.commit();

            // Refresh courses list
            await fetchCourses();

            // Navigate to editor
            navigate(`/projects/${courseDocRef.id}`);
        } catch (error) {
            console.error('Error processing file:', error);
            alert('Erro ao processar arquivo. Verifique o formato e tente novamente.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    async function handleSignOut() {
        await signOut();
        navigate('/');
    }

    async function handleDownloadAll(courseId: string, courseTitle: string, e: React.MouseEvent) {
        e.stopPropagation();

        try {
            const lessonsQuery = query(collection(db, 'lessons'), where('course_id', '==', courseId));
            const snapshot = await getDocs(lessonsQuery);
            const lessons: Lesson[] = snapshot.docs.map(d => ({
                id: d.id,
                ...(d.data() as Omit<Lesson, 'id'>)
            }));

            lessons.sort((a, b) => a.lesson_order - b.lesson_order);

            if (lessons.length === 0) {
                alert('Este projeto não possui aulas para baixar.');
                return;
            }

            const zip = new JSZip();
            const safeTitle = courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            lessons.forEach((lesson) => {
                const lessonNum = lesson.lesson_order.toString().padStart(2, '0');

                if (lesson.edited_content) {
                    zip.file(`Aula ${lessonNum}.txt`, lesson.edited_content);
                }

                if (lesson.prompt) {
                    zip.file(`Prompt Aula ${lessonNum}.txt`, lesson.prompt);
                }
            });

            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, `${safeTitle}_completo.zip`);
        } catch (error) {
            console.error('Error downloading all files:', error);
            alert('Erro ao baixar arquivos. Tente novamente.');
        }
    }

    async function handleDeleteCourse(courseId: string, courseTitle: string, e: React.MouseEvent) {
        e.stopPropagation();

        const confirmed = window.confirm(
            `Tem certeza que deseja excluir o projeto "${courseTitle}"?\n\nEsta ação não pode ser desfeita.`
        );

        if (!confirmed) return;

        try {
            // Delete the course document
            await deleteDoc(doc(db, 'courses', courseId));

            // Delete associated lessons
            const lessonsQuery = query(collection(db, 'lessons'), where('course_id', '==', courseId));
            const snapshot = await getDocs(lessonsQuery);

            if (!snapshot.empty) {
                const batch = writeBatch(db);
                snapshot.docs.forEach(lessonDoc => {
                    batch.delete(lessonDoc.ref);
                });
                await batch.commit();
            }

            // Refresh courses list
            await fetchCourses();
        } catch (error) {
            console.error('Error deleting course:', error);
            alert('Erro ao excluir projeto. Tente novamente.');
        }
    }

    return (
        <div className="dashboard-container">
            <header className="dashboard-header">
                <div className="header-content">
                    <div>
                        <h1>Dashboard</h1>
                        <p className="user-info">
                            {userProfile?.email || user?.email} • {userProfile?.role === 'admin' ? 'Administrador' : userProfile?.role === 'designer' ? 'Designer' : 'Assistente'}
                        </p>
                    </div>
                    <div className="header-actions">
                        <button className="btn btn-ghost" onClick={() => navigate('/settings')}>
                            <SettingsIcon size={18} />
                            Configurações
                        </button>
                        <button className="btn btn-secondary" onClick={handleSignOut}>
                            <LogOut size={18} />
                            Sair
                        </button>
                    </div>
                </div>
            </header>

            <main className="dashboard-main">
                <div className="container">
                    <section className="upload-section fade-in">
                        <div className="upload-card">
                            <div className="upload-icon">
                                <Upload size={48} />
                            </div>
                            <h2>Processar Nova Apostila</h2>
                            <p>Faça upload de um arquivo DOCX para transformar em módulos de aulas</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".docx"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                            />
                            <button
                                className="btn btn-primary btn-large"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <>
                                        <Loader className="spinner" size={20} />
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={20} />
                                        Selecionar Arquivo
                                    </>
                                )}
                            </button>
                        </div>
                    </section>

                    <section className="projects-section fade-in" style={{ animationDelay: '0.1s' }}>
                        <h2>Projetos Recentes</h2>
                        {loading ? (
                            <div className="loading-projects">
                                <div className="spinner" />
                            </div>
                        ) : courses.length === 0 ? (
                            <div className="empty-projects">
                                <FileText size={48} />
                                <p>Nenhum projeto encontrado. Comece fazendo upload de uma apostila.</p>
                            </div>
                        ) : (
                            <div className="projects-grid">
                                {courses.map((course) => (
                                    <div
                                        key={course.id}
                                        className="project-card"
                                        onClick={() => navigate(`/projects/${course.id}`)}
                                    >
                                        <div className="card-icon">
                                            <BookOpen size={32} />
                                        </div>
                                        <div className="card-content">
                                            <h3>{course.title}</h3>
                                            <p className="card-date">
                                                Criado em {new Date(course.created_at || '').toLocaleDateString('pt-BR')}
                                            </p>
                                        </div>
                                        <div className="card-actions">
                                            <button
                                                className="btn-icon"
                                                onClick={(e) => handleDownloadAll(course.id, course.title, e)}
                                                title="Baixar tudo (ZIP)"
                                            >
                                                <Download size={18} />
                                            </button>
                                            <button
                                                className="btn-icon delete-btn"
                                                onClick={(e) => handleDeleteCourse(course.id, course.title, e)}
                                                title="Excluir projeto"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}
