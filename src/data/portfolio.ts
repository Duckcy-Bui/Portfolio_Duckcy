export const profile = {
  name: 'Bui Hai Duc',
  brand: 'Duckcy',
  role: 'Software Engineering Intern',
  orientation: 'Backend engineering with a DevOps mindset',
  summary: 'I build backend systems and make their deployment reliable. My work brings together software engineering, Docker, CI/CD and Linux operations.',
  objective: 'Currently pursuing Software Engineering with a DevOps orientation, applying backend development, Docker, CI/CD and Linux operations in real project environments. I aim to build reliable software systems while improving deployment quality and operational efficiency.',
  email: 'duckcy.work@gmail.com',
  phone: '+84 97 679 5113',
  telephone: '+84976795113',
  location: 'No. 3, Cau Giay, Hanoi',
  dateOfBirth: '13/05/2005',
  cv: '/assets/CV_bui_hai_duc.pdf',
  github: 'https://github.com/Duckcy-Bui',
  linkedin: 'https://www.linkedin.com/in/duckcy/',
  facebook: 'https://www.facebook.com/HaiDuc12528/',
  university: 'University of Transport and Communications',
  educationPeriod: '2023 – Present',
  major: 'Information Technology',
  gpa: '3.4 / 4.0',
  strengths: ['Systems thinking and practical problem-solving', 'Pipeline and infrastructure research', 'Deployment process optimization', 'Collaboration and self-directed learning'],
};

export type Project = {
  slug: string; name: string; category: string; summary: string; role: string;
  period: string; stack: string[]; github: string; featured: boolean;
  accent: string; illustration: string;
};

export const projects: Project[] = [
  {
    slug: 'sblt-cup', name: 'SBLT CUP', category: 'Tournament platform',
    summary: 'A TFT tournament platform with multi-stage competition, live updates and an automated prediction system.',
    role: 'Software engineering', period: 'May 2026',
    stack: ['Next.js', 'TypeScript', 'Prisma', 'PostgreSQL', 'Redis', 'SSE', 'Web Push', 'Tailwind', 'CI/CD'],
    github: 'https://github.com/Duckcy-Bui/SBLT-CUP', featured: true, accent: 'blue', illustration: 'tournament',
  },
  {
    slug: 'classes369', name: 'Classes369', category: 'Student management',
    summary: 'A modular Flask API and a reproducible Docker deployment for an IT center’s student management system.',
    role: 'Backend & DevOps', period: 'Feb – May 2026',
    stack: ['Flask', 'SQL Server', 'Docker', 'Python', 'GenAI', 'bcrypt'],
    github: 'https://github.com/Duckcy-Bui/api_web_student_manager', featured: true, accent: 'green', illustration: 'classroom',
  },
  {
    slug: 'investor-ai', name: 'Investor AI', category: 'Data & infrastructure',
    summary: 'Containerized infrastructure, data pipelines and CI/CD for an AI-powered stock analysis platform.',
    role: 'DevOps', period: 'Jan – Jun 2025',
    stack: ['Spring Boot', 'React', 'Airflow', 'Docker', 'PostgreSQL', 'Spark', 'Redis', 'MinIO', 'CUDA'],
    github: 'https://github.com/ltdungg/Investor-AI-Website', featured: true, accent: 'purple', illustration: 'pipeline',
  },
];

export const skillGroups = [
  { id: 'devops', name: 'DevOps', description: 'The tools I use to make development and deployment repeatable.', items: [
    { name: 'Docker', icon: 'docker_icon.png' }, { name: 'Docker Compose', icon: 'docker-compose_icon-removebg-preview.png' },
    { name: 'Linux', icon: 'linux_icon.png' }, { name: 'Airflow', icon: 'apache-airflow_icon.png' },
    { name: 'Jenkins', icon: 'Jenkins_icon.png' }, { name: 'GitHub Actions', icon: 'github-actions_icon-removebg-preview.png' },
  ] },
  { id: 'backend', name: 'Languages & frameworks', description: 'Building application logic, APIs and useful interfaces.', items: [
    { name: 'Python', icon: 'python_icon-removebg-preview.png' }, { name: 'Java', icon: 'java_icon.png' },
    { name: 'C++', icon: 'c++_icon-removebg-preview.png' }, { name: 'SQL', icon: 'sql_icon.png' },
    { name: 'Flask', icon: 'flask_icon-removebg-preview.png' }, { name: 'Spring Boot', icon: 'spring_boot_icon-removebg-preview.png' },
    { name: 'React', icon: 'react_icon.png' }, { name: 'JavaFX', icon: 'javaFX_icon-removebg-preview.png' },
  ] },
  { id: 'data', name: 'Data & storage', description: 'Databases, caching and tools for working with data.', items: [
    { name: 'PostgreSQL', icon: 'postgreesql_icon-removebg-preview.png' }, { name: 'SQL Server', icon: 'sql-server_icon-removebg-preview.png' },
    { name: 'Redis', icon: 'redis_icon-removebg-preview.png' }, { name: 'Spark', icon: 'spark_icon-removebg-preview.png' },
    { name: 'MinIO', icon: 'MINIO_icon.png' },
  ] },
  { id: 'practices', name: 'Engineering practices', description: 'Connecting code, systems and delivery.', items: [
    { name: 'CI/CD', icon: 'CI-CD_icon.png' }, { name: 'Git / GitHub', icon: 'git-github_icon.png' },
    { name: 'RESTful API', icon: 'RESTful_icon-removebg-preview.png' }, { name: 'ETL pipelines', icon: 'ETL-pipeline_icon.png' },
    { name: 'Microservices', icon: 'microservice_icon.png' },
  ] },
];
export const skills = skillGroups.flatMap((group) => group.items.map((item) => item.name));

export const experiences = [
  { organization: 'NestScale', role: 'Software Engineer Intern', period: 'Present', category: 'Work experience', logo: '/assets/experience/nestscale-logo.png', description: 'Building software engineering experience with a DevOps-oriented mindset, focused on backend systems, deployment quality and operational reliability.', location: 'Đê La Thành, Hanoi' },
  { organization: 'University of Transport and Communications', role: 'Information Technology student', period: '2023 – Present', category: 'Education', logo: '/assets/experience/utc-logo.png', description: 'Studying Information Technology, with an interest in backend development, system design and cloud deployment. GPA: 3.4 / 4.0.', location: 'Hanoi, Vietnam' },
  { organization: 'SFIT Club', role: 'Technical Lead & Mentor', period: '2023 – Present', category: 'Community', logo: '/assets/experience/sfit-badge.svg', description: 'Planning and coordinating technical workshops, mentoring fundamental programming courses and promoting project-based learning.', location: 'Technical & Cloud Committee' },
];

export const certificates = [
  { id: 'aws-sbg-core-team', title: 'AWS SBG Core Team Member Badge', issuer: 'AWS Community', issued: 'July 2026', badgeId: '73787dad-002a-4cce-b49d-011b40587df9', url: 'https://www.credly.com/badges/73787dad-002a-4cce-b49d-011b40587df9', description: 'Recognition as an AWS Student Builder Group Core Team member.', skills: ['Community Building', 'Organization and Leadership', 'Student Engagement'] },
];

export const navigation = [
  { label: 'Home', href: '/' }, { label: 'About', href: '/about/' },
  { label: 'Skills', href: '/skills/' }, { label: 'Projects', href: '/projects/' },
  { label: 'Experience', href: '/experience/' }, { label: 'Certificates', href: '/certificate/' },
  { label: 'Contact', href: '/contact/' },
];

export const themes = [
  { value: 'dark', label: 'Outer Space' }, { value: 'light', label: 'Daylight' },
  { value: 'forest', label: 'Forest Terminal' }, { value: 'ocean', label: 'Deep Ocean' },
  { value: 'sunset', label: 'Sunset Ember' },
];
