import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Course } from '../lib/supabase';
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
            const { data, error } = await supabase
                .from('courses')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCourses(data || []);
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
            // detailed: match 3 or more newlines (with optional whitespace) and replace with 1 newline
            // as requested by user ("leave only one line break")
            fullText = fullText.replace(/\n\s*\n\s*\n+/g, '\n');

            // Also clean up lines that are just whitespace
            fullText = fullText.split('\n').map(line => line.trim()).join('\n');

            // Extract course title from first line of document (not filename)
            const firstLine = fullText.split('\n')[0].trim();
            const courseTitle = firstLine || file.name.replace('.docx', '').replace(/_/g, ' ');

            console.log('=== DOCX PARSING DEBUG ===');
            console.log('Course title extracted:', courseTitle);
            console.log('Full text length:', fullText.length);
            console.log('First 1000 chars:', fullText.substring(0, 1000));

            // Split into sections
            const sections: string[] = [];

            // Try multiple module patterns (in order of specificity)
            // Pattern 1: "Módulo: X.Y" format (e.g., "Módulo: 1.1", "Módulo: 2.3")
            // Pattern 2: "Módulo X:" format (e.g., "Módulo 1:", "Módulo 2:")
            const patterns = [
                { regex: /Módulo:\s*\d+\.\d+/gi, name: 'Módulo: X.Y' },
                { regex: /Módulo\s+\d+:/gi, name: 'Módulo X:' },
            ];

            let matches: RegExpMatchArray[] = [];
            // patternName removed

            for (const pattern of patterns) {
                const found = Array.from(fullText.matchAll(pattern.regex));
                if (found.length > 0) {
                    matches = found;
                    // patternName removed
                    console.log(`✓ Found ${found.length} module markers using pattern: ${pattern.name}`);
                    console.log('First 5 matches:', found.slice(0, 5).map(m => m[0]));
                    break;
                }
            }

            if (matches.length === 0) {
                // No module markers found
                console.log('✗ No module markers found');
                console.log('Using entire document as one lesson');
                sections.push(fullText.trim());
            } else {
                console.log(`\n=== EXTRACTING SECTIONS ===`);

                // Extract introduction (everything before first module)
                const firstModuleIndex = matches[0].index!;
                if (firstModuleIndex > 100) { // Minimum intro size (lowered to capture more content)
                    const intro = fullText.substring(0, firstModuleIndex).trim();
                    console.log(`Intro: ${intro.length} chars`);
                    sections.push(intro);
                } else {
                    console.log(`Intro skipped: too short (${firstModuleIndex} chars)`);
                }

                // Extract each module section
                for (let i = 0; i < matches.length; i++) {
                    const startIndex = matches[i].index!;
                    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : fullText.length;
                    const moduleContent = fullText.substring(startIndex, endIndex).trim();

                    // Only include sections with substantial content (at least 1000 chars)
                    if (moduleContent.length > 1000) {
                        console.log(`${matches[i][0]}: ${moduleContent.length} chars`);
                        sections.push(moduleContent);
                    } else {
                        console.log(`${matches[i][0]}: SKIPPED (too short: ${moduleContent.length} chars)`);
                    }
                }
            }

            console.log(`\n=== RESULT: ${sections.length} sections extracted ===\n`);

            // Create course
            const { data: courseData, error: courseError } = await supabase
                .from('courses')
                .insert({
                    user_id: user!.id,
                    title: courseTitle,
                })
                .select()
                .single();

            if (courseError) throw courseError;

            // Get prompt templates from database or use defaults
            const { data: templates } = await supabase
                .from('prompt_templates')
                .select('*')
                .or('user_id.is.null,user_id.eq.' + user!.id);

            // Default templates if not found in database
            const defaultTemplate = `Papel: Atue como um instrutor experiente e didático. O tom deve ser de uma aula formal, mas acessível.

Estrutura da Aula:

Introdução Obrigatória: Inicie EXATAMENTE com a frase: "Nesse curso vamos aprender sobre: {course_title}"

Logo em seguida, instrua o aluno a pegar a apostila para acompanhar o conteúdo visualmente enquanto ouve.

Conteúdo da Aula: {lesson_content}

Conclusão Obrigatória: Encerre a aula EXATAMENTE com a frase: "Obrigado por ficar até aqui e te vejo na próxima aula."

Instruções Adicionais: Foque em explicar com clareza.`;

            // Prioritize user templates over system templates
            const userFirst = templates?.find((t) => t.template_type === 'first' && t.user_id === user!.id);
            const systemFirst = templates?.find((t) => t.template_type === 'first' && !t.user_id);
            const firstTemplate = (userFirst || systemFirst)?.template || defaultTemplate;

            const userMiddle = templates?.find((t) => t.template_type === 'middle' && t.user_id === user!.id);
            const systemMiddle = templates?.find((t) => t.template_type === 'middle' && !t.user_id);
            const middleTemplate = (userMiddle || systemMiddle)?.template || defaultTemplate;

            const userLast = templates?.find((t) => t.template_type === 'last' && t.user_id === user!.id);
            const systemLast = templates?.find((t) => t.template_type === 'last' && !t.user_id);
            const lastTemplate = (userLast || systemLast)?.template || defaultTemplate;

            console.log('Templates logic applied:');
            console.log('  First Source:', userFirst ? 'User' : systemFirst ? 'System' : 'Default');
            console.log('  Middle Source:', userMiddle ? 'User' : systemMiddle ? 'System' : 'Default');
            console.log('  Last Source:', userLast ? 'User' : systemLast ? 'System' : 'Default');

            // Create lessons
            const lessonsToInsert = sections.map((content, index) => {
                let template = middleTemplate;
                if (index === 0) template = firstTemplate;
                if (index === sections.length - 1) template = lastTemplate;

                // Extract module title from content
                // Try both formats: "Módulo: X.Y Title" or "Módulo X: Title"
                let moduleMatch = content.match(/Módulo:\s*\d+\.\d+\s*(.+)/i);
                if (!moduleMatch) {
                    moduleMatch = content.match(/Módulo\s+\d+:\s*(.+)/i);
                }
                const lessonTitle = moduleMatch ? moduleMatch[1].split('\n')[0].trim() : `Aula ${index + 1}`;

                // Replace variables in the template
                const prompt = template
                    .replace(/\{course_title\}/g, courseTitle)
                    .replace(/\{lesson_content\}/g, lessonTitle)
                    .replace(/\{aula\}/g, (index + 1).toString());

                console.log(`Lesson ${index + 1}:`);
                console.log(`  Title: ${lessonTitle}`);
                console.log(`  Template type: ${index === 0 ? 'first' : index === sections.length - 1 ? 'last' : 'middle'}`);
                console.log(`  Prompt preview: ${prompt.substring(0, 100)}...`);

                return {
                    course_id: courseData.id,
                    original_content: content,
                    edited_content: content,
                    prompt,
                    lesson_order: index + 1,
                };
            });

            const { error: lessonsError } = await supabase.from('lessons').insert(lessonsToInsert);

            if (lessonsError) throw lessonsError;

            // Refresh courses list
            await fetchCourses();

            // Navigate to editor
            navigate(`/projects/${courseData.id}`);
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
            // Fetch all lessons for this course
            const { data: lessons, error } = await supabase
                .from('lessons')
                .select('*')
                .eq('course_id', courseId)
                .order('lesson_order');

            if (error) throw error;
            if (!lessons || lessons.length === 0) {
                alert('Este projeto não possui aulas para baixar.');
                return;
            }

            const zip = new JSZip();
            const safeTitle = courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            // Add files to zip
            lessons.forEach((lesson) => {
                const lessonNum = lesson.lesson_order.toString().padStart(2, '0');

                // Add Content
                if (lesson.edited_content) {
                    zip.file(`Aula ${lessonNum}.txt`, lesson.edited_content);
                }

                // Add Prompt
                if (lesson.prompt) {
                    zip.file(`Prompt Aula ${lessonNum}.txt`, lesson.prompt);
                }
            });

            // Generate and save zip
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, `${safeTitle}_completo.zip`);

        } catch (error) {
            console.error('Error downloading all files:', error);
            alert('Erro ao baixar arquivos. Tente novamente.');
        }
    }

    async function handleDeleteCourse(courseId: string, courseTitle: string, e: React.MouseEvent) {
        e.stopPropagation(); // Prevent navigation to editor

        const confirmed = window.confirm(
            `Tem certeza que deseja excluir o projeto "${courseTitle}"?\n\nEsta ação não pode ser desfeita.`
        );

        if (!confirmed) return;

        try {
            // Delete course (lessons will be deleted automatically due to CASCADE)
            const { error } = await supabase
                .from('courses')
                .delete()
                .eq('id', courseId);

            if (error) throw error;

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
                            {userProfile?.email} • {userProfile?.role === 'admin' ? 'Administrador' : userProfile?.role === 'designer' ? 'Designer' : 'Assistente'}
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
