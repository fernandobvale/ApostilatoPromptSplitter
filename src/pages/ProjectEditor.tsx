import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Lesson } from '../lib/supabase';
import { ArrowLeft, Copy, Save, Check, Download, Trash2 } from 'lucide-react';
import './ProjectEditor.css';

export default function ProjectEditor() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [lessons, setLessons] = useState<Lesson[]>([]);
    const [selectedLesson, setSelectedLesson] = useState<number>(0);
    const [editedContent, setEditedContent] = useState('');
    const [courseTitle, setCourseTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copiedText, setCopiedText] = useState(false);
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    useEffect(() => {
        fetchCourseData();
    }, [id]);

    useEffect(() => {
        if (lessons[selectedLesson]) {
            setEditedContent(lessons[selectedLesson].edited_content || '');
        }
    }, [selectedLesson, lessons]);

    async function fetchCourseData() {
        try {
            const { data: courseData, error: courseError } = await supabase
                .from('courses')
                .select('*')
                .eq('id', id)
                .single();

            if (courseError) throw courseError;
            setCourseTitle(courseData.title);

            const { data: lessonsData, error: lessonsError } = await supabase
                .from('lessons')
                .select('*')
                .eq('course_id', id)
                .order('lesson_order');

            if (lessonsError) throw lessonsError;
            setLessons(lessonsData || []);
        } catch (error) {
            console.error('Error fetching course:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        try {
            // Update course title
            await supabase.from('courses').update({ title: courseTitle }).eq('id', id);

            // Update current lesson
            const currentLesson = lessons[selectedLesson];
            if (currentLesson) {
                await supabase
                    .from('lessons')
                    .update({ edited_content: editedContent })
                    .eq('id', currentLesson.id);

                // Update local state
                const updatedLessons = [...lessons];
                updatedLessons[selectedLesson] = {
                    ...currentLesson,
                    edited_content: editedContent,
                };
                setLessons(updatedLessons);
            }

            alert('Alterações salvas com sucesso!');
        } catch (error) {
            console.error('Error saving:', error);
            alert('Erro ao salvar alterações.');
        } finally {
            setSaving(false);
        }
    }

    function copyToClipboard(text: string, type: 'text' | 'prompt') {
        navigator.clipboard.writeText(text);
        if (type === 'text') {
            setCopiedText(true);
            setTimeout(() => setCopiedText(false), 2000);
        } else {
            setCopiedPrompt(true);
            setTimeout(() => setCopiedPrompt(false), 2000);
        }
    }

    function downloadFile(filename: string, content: string) {
        const element = document.createElement('a');
        const file = new Blob([content], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = filename;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }

    async function handleDeleteLesson(lessonId: string) {
        if (!window.confirm('Tem certeza que deseja excluir esta aula? Esta ação não pode ser desfeita.')) {
            return;
        }

        setLoading(true);
        try {
            // Delete lesson
            const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
            if (error) throw error;

            // Remove from local state
            const remainingLessons = lessons.filter(l => l.id !== lessonId);

            // Reorder remaining lessons
            const reorderedLessons = remainingLessons.map((lesson, index) => ({
                ...lesson,
                lesson_order: index + 1
            }));

            // Update order in database
            // We do this sequentially to ensure order is correct
            for (const lesson of reorderedLessons) {
                await supabase
                    .from('lessons')
                    .update({ lesson_order: lesson.lesson_order })
                    .eq('id', lesson.id);
            }

            setLessons(reorderedLessons);

            // Adjust selected lesson if current one was deleted
            if (selectedLesson >= reorderedLessons.length) {
                setSelectedLesson(Math.max(0, reorderedLessons.length - 1));
            } else {
                // Force update content for new selected lesson (same index, different lesson)
                if (reorderedLessons[selectedLesson]) {
                    setEditedContent(reorderedLessons[selectedLesson].edited_content || '');
                } else {
                    setEditedContent('');
                }
            }

        } catch (error) {
            console.error('Error deleting lesson:', error);
            alert('Erro ao excluir aula.');
        } finally {
            setLoading(false);
        }
    }


    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner" style={{ width: '40px', height: '40px' }} />
            </div>
        );
    }

    const currentLesson = lessons[selectedLesson];

    return (
        <div className="editor-container">
            <header className="editor-header">
                <div className="header-content">
                    <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft size={18} />
                        Voltar
                    </button>
                    <div className="header-title">
                        <input
                            type="text"
                            className="input title-input"
                            value={courseTitle}
                            onChange={(e) => setCourseTitle(e.target.value)}
                            placeholder="Título do Curso"
                        />
                    </div>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? (
                            <>
                                <div className="spinner" />
                                <span className="save-text">Salvando...</span>
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                <span className="save-text">Salvar</span>
                            </>
                        )}
                    </button>
                </div>
            </header>

            <div className="editor-main">
                <aside className="lessons-sidebar">
                    <div className="sidebar-header">
                        <h3>Aulas ({lessons.length})</h3>
                    </div>
                    <div className="lessons-list">
                        {lessons.map((lesson, index) => (
                            <div key={lesson.id} className="lesson-item-wrapper">
                                <button
                                    className={`lesson-item ${selectedLesson === index ? 'active' : ''}`}
                                    onClick={() => setSelectedLesson(index)}
                                >
                                    <span className="lesson-number">Aula {lesson.lesson_order}</span>
                                    {/* Try to extract a short title if possible, otherwise use type */}
                                    <span className="lesson-type">
                                        {index === 0 ? 'Início' : index === lessons.length - 1 ? 'Fim' : 'Aula'}
                                    </span>
                                </button>
                                {selectedLesson === index && (
                                    <button
                                        className="delete-lesson-btn"
                                        title="Excluir aula"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteLesson(lesson.id);
                                        }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="editor-content">
                    {currentLesson ? (
                        <>
                            <section className="content-section">
                                <div className="section-header">
                                    <h2>Conteúdo da Aula {currentLesson.lesson_order}</h2>
                                    <div className="header-actions">
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => downloadFile(`Aula ${currentLesson.lesson_order}.txt`, editedContent)}
                                            title="Baixar conteúdo"
                                        >
                                            <Download size={16} />
                                            <span className="btn-label">Baixar</span>
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => copyToClipboard(editedContent, 'text')}
                                            title="Copiar conteúdo"
                                        >
                                            {copiedText ? <Check size={16} /> : <Copy size={16} />}
                                            <span className="btn-label">{copiedText ? 'Copiado!' : 'Copiar'}</span>
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    className="textarea content-textarea"
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    placeholder="Conteúdo da aula..."
                                />
                            </section>

                            <section className="prompt-section">
                                <div className="section-header">
                                    <h2>Prompt de IA</h2>
                                    <div className="header-actions">
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => downloadFile(`Prompt Aula ${currentLesson.lesson_order}.txt`, currentLesson.prompt || '')}
                                            title="Baixar prompt"
                                        >
                                            <Download size={16} />
                                            <span className="btn-label">Baixar</span>
                                        </button>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => copyToClipboard(currentLesson.prompt || '', 'prompt')}
                                            title="Copiar prompt"
                                        >
                                            {copiedPrompt ? <Check size={16} /> : <Copy size={16} />}
                                            <span className="btn-label">{copiedPrompt ? 'Copiado!' : 'Copiar'}</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="prompt-display">
                                    <pre>{currentLesson.prompt}</pre>
                                </div>
                            </section>
                        </>
                    ) : (
                        <div className="empty-state">
                            <p>Selecione uma aula para editar ou não há aulas disponíveis.</p>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
