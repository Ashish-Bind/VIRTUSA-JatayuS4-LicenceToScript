# Quizzer Assessment Platform

Quizzer is a robust, Flask-based online assessment platform designed to deliver adaptive, proctored exams for job candidates. It supports dynamic question selection based on candidate experience and skill proficiency, integrates with Google Cloud Storage for snapshot uploads, and includes proctoring features like face verification and violation detection. The platform is ideal for recruiters and organizations looking to evaluate candidates efficiently and securely.

## Features

- **Adaptive Question Selection**: Questions are tailored to the candidate's experience and skill level, with difficulty bands ("good", "better", "perfect") adjusted based on performance.
- **Proctoring System**: Captures webcam snapshots, detects violations (e.g., gaze away, multiple faces), and performs face verification against candidate profiles.
- **Skill-Based Assessments**: Supports multiple skills per job role, with questions weighted by priority and dynamically generated or pulled from a question bank.
- **Performance Tracking**: Logs candidate performance, including accuracy, time spent, and difficulty progression, stored in a PostgreSQL database.
- **Google Cloud Integration**: Stores snapshots and violation images in Google Cloud Storage for secure proctoring.
- **RESTful API**: Provides endpoints for starting assessments, capturing snapshots, submitting answers, and retrieving results.
- **Database-Driven State Management**: Persists assessment states in a PostgreSQL database with JSONB for scalability in stateless environments like Cloud Run.

## Prerequisites

- **Python**: 3.8 or higher (for local development)
- **PostgreSQL**: For storing assessment data and states
- **Google Cloud Platform**: Account with access to Google Cloud Storage and (optionally) face verification APIs
- **Docker**: For containerized deployment
- **Node.js/NPM**: For the frontend (Vite-based)
- **Git**: For cloning the repository

## Installation

### Local Setup

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/Ashish-Bind/Jatayu-Final.git
   cd Jatayu-Final
   ```

2. **Set Up a Virtual Environment**:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Dependencies**:
   Ensure you have a `requirements.txt` file with the necessary dependencies. Example:

   ```text
   flask
   sqlalchemy
   psycopg2-binary
   google-cloud-storage
   requests
   numpy
   timeout-decorator
   python-dotenv
   ```

   Then install:

   ```bash
   pip install -r requirements.txt
   ```

4. **Set Up Environment Variables**:
   See the [Environment Variables](#environment-variables) section below for details on configuring `.env` files for the backend and frontend.

5. **Set Up the Database**:
   Initialize the PostgreSQL database and run migrations:

   ```bash
   flask db init
   flask db migrate
   flask db upgrade
   ```

   Ensure your database schema includes the tables defined in `app/models` (e.g., `Candidate`, `AssessmentAttempt`, `AssessmentState`).

6. **Set Up Google Cloud Storage**:

   - Create a bucket named `gen-ai-quiz` in Google Cloud Storage.
   - Ensure the service account has permissions to read/write to the bucket.

7. **Run the Application**:
   ```bash
   flask run
   ```
   The API will be available at `http://localhost:5000/api/assessment`.

### Docker Setup

To run the Jatayu Assessment Platform using Docker, follow these steps. This assumes a Docker Compose setup for both the Flask backend and PostgreSQL database, with the frontend served separately.

1. **Install Docker and Docker Compose**:

   - Install [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).
   - Verify installation:
     ```bash
     docker --version
     docker-compose --version
     ```

2. **Create a `Dockerfile` for the Backend**:
   In the project root, create a `Dockerfile`:

   ```dockerfile
   FROM python:3.8-slim

   WORKDIR /app
   COPY . .
   RUN pip install --no-cache-dir -r requirements.txt
   ENV FLASK_APP=app.py
   ENV FLASK_ENV=production
   EXPOSE 5000
   CMD ["flask", "run", "--host=0.0.0.0"]
   ```

3. **Create a `docker-compose.yml`**:
   In the project root, create a `docker-compose.yml`:

   ```yaml
   version: '3.8'
   services:
     backend:
       build: .
       ports:
         - '5000:5000'
       environment:
         - FLASK_APP=app.py
         - FLASK_ENV=production
         - DATABASE_URL=postgresql://postgres:1234!@#$@db:5432/KnowledgeBase
         - GOOGLE_CLOUD_PROJECT=your-project-id
         - GOOGLE_APPLICATION_CREDENTIALS=/app/keys/gcp-key.json
         - SECRET_KEY=259535b8c4eb895eef25e9073e7b7d6c37af47cdc50829ec5cc4656c0764a2ba
         - EMAILABLE_API_KEY=api_key
         - RAZORPAY_KEY_ID=razorpya_id
         - RAZORPAY_KEY_SECRET=razorpay_key
         - MAIL_SERVER=smtp.gmail.com
         - MAIL_PORT=587
         - MAIL_USE_TLS=True
         - MAIL_USERNAME=example@gmail.com
         - MAIL_PASSWORD=abcd
         - MAIL_DEFAULT_SENDER=example@gmail.com
         - MAIL_USE_SSL=False
         - GCS_BUCKET=gen-ai-quiz
         - CLIENT_BASE_URL=http://localhost:5173
       volumes:
         - ./keys:/app/keys
       depends_on:
         - db

     db:
       image: postgres:13
       environment:
         - POSTGRES_USER=postgres
         - POSTGRES_PASSWORD=1234!@#$
         - POSTGRES_DB=KnowledgeBase
       ports:
         - '5432:5432'
       volumes:
         - postgres_data:/var/lib/postgresql/data

     frontend:
       build:
         context: ./frontend
         dockerfile: Dockerfile
       ports:
         - '5173:5173'
       environment:
         - VITE_API_BASE_URL=http://backend:5000/api
       depends_on:
         - backend

   volumes:
     postgres_data:
   ```

4. **Create a `Dockerfile` for the Frontend**:
   In the `frontend/` directory, create a `Dockerfile` (adjust if your frontend directory has a different name):

   ```dockerfile
   FROM node:16
   WORKDIR /app
   COPY . .
   RUN npm install
   EXPOSE 5173
   CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
   ```

5. **Set Up Google Cloud Credentials**:

   - Place your Google Cloud service account key (`gcp-key.json`) in a `keys/` directory in the project root.
   - Ensure the `keys/` directory is included in `.gitignore` to avoid exposing sensitive credentials.

6. **Build and Run with Docker Compose**:

   ```bash
   docker-compose up --build
   ```

   - The backend will be available at `http://localhost:5000/api/assessment`.
   - The frontend will be available at `http://localhost:5173`.
   - The PostgreSQL database will be accessible at `localhost:5432`.

7. **Stop the Application**:
   ```bash
   docker-compose down
   ```

## Environment Variables

Jatayu requires environment variables for both the backend and frontend to configure database connections, API keys, and other settings. **Never commit `.env` files to version control, as they contain sensitive information.**

### Backend `.env` File

Create a `.env` file in the project root for the Flask backend. Example:

```text
# Flask Configuration
FLASK_APP=app.py
FLASK_ENV=development

# Database Configuration
DB_NAME=KnowledgeBase
DB_USER=postgres
DB_PASSWORD=1234!@#$
DB_HOST=localhost  # Use 'db' for Docker or your RDS endpoint for production
DB_PORT=5432
DATABASE_URL=postgresql://postgres:1234!@#$@localhost:5432/KnowledgeBase

# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=./keys/gcp-key.json
GCS_BUCKET=gen-ai-quiz

# API Keys
GOOGLE_API_KEY=your-google-api-key
EMAILABLE_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Email Configuration
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=True
MAIL_USERNAME= # Use Google email
MAIL_PASSWORD= # Use an App Password for Gmail
MAIL_DEFAULT_SENDER= # Use Google Gmail
MAIL_USE_SSL=False

# Application Configuration
SECRET_KEY=259535b8c4eb895eef25e9073e7b7d6c37af47cdc50829ec5cc4656c0764a2ba
CLIENT_BASE_URL=http://localhost:5173
```

**Security Notes**:

- Replace `your-google-api-key` and `your-project-id` with your actual Google Cloud credentials.
- Store `gcp-key.json` in a secure location and reference it in `GOOGLE_APPLICATION_CREDENTIALS`.
- Use a strong, unique `SECRET_KEY` for Flask.
- For `MAIL_PASSWORD`, use an App Password if using Gmail (generate one in your Google Account settings).
- Add `.env` and `keys/` to `.gitignore`:
  ```text
  .env
  keys/
  ```

### Frontend `.env` File

Create a `.env` file in the `frontend/` directory for the Vite-based frontend. Example:

```text
VITE_API_BASE_URL=http://localhost:5000/api
```

**Notes**:

- Update `VITE_API_BASE_URL` to match your backend URL (e.g., `http://backend:5000/api` in Docker).
- Add `.env` to `.gitignore` in the `frontend/` directory.

## Usage

### API Endpoints

- **POST /api/assessment/start/<attempt_id>**: Initialize an assessment session for a given `attempt_id`.
- **POST /api/assessment/capture-snapshot/<attempt_id>**: Capture and store a webcam snapshot for proctoring.
- **POST /api/assessment/store-violation/<attempt_id>**: Log a proctoring violation (e.g., gaze away, multiple faces).
- **POST /api/assessment/next-question/<attempt_id>**: Retrieve the next question based on candidate performance.
- **POST /api/assessment/submit-answer/<attempt_id>**: Submit an answer and receive feedback.
- **POST /api/assessment/end/<attempt_id>**: Finalize the assessment and save results.
- **GET /api/assessment/results/<attempt_id>**: Retrieve results for a completed assessment.
- **GET /api/assessment/all**: List all completed assessments for the logged-in candidate.

### Example Workflow

1. A candidate logs in and starts an assessment via `/start/<attempt_id>`.
2. The system captures periodic webcam snapshots using `/capture-snapshot/<attempt_id>`.
3. Questions are served via `/next-question/<attempt_id>`, adapting difficulty based on answers.
4. Answers are submitted to `/submit-answer/<attempt_id>`, with feedback provided.
5. The assessment is completed using `/end/<attempt_id>`, and results are viewed via `/results/<attempt_id>`.

### Proctoring

- Snapshots are stored in Google Cloud Storage under `snapshots/` and `violations/`.
- Face verification compares snapshots against the candidate’s profile picture.
- Violations (e.g., no face detected) are logged in the `ProctoringViolation` table.

## Project Structure

```
Jatayu-Final/
├── app/
│   ├── models/
│   │   ├── candidate.py
│   │   ├── job.py
│   │   ├── assessment_attempt.py
│   │   ├── assessment_state.py
│   │   ├── required_skill.py
│   │   ├── skill.py
│   │   ├── candidate_skill.py
│   │   ├── mcq.py
│   │   ├── assessment_registration.py
│   │   ├── proctoring_violation.py
│   ├── services/
│   │   ├── question_batches.py
│   ├── utils/
│   │   ├── gcs_upload.py
│   │   ├── face.py
│   ├── __init__.py
├── frontend/
│   ├── src/
│   ├── .env
│   ├── Dockerfile
├── static/
│   ├── uploads/
│   │   ├── snapshots/
│   │   ├── violations/
│   │   ├── webcam_images/
├── keys/
│   ├── gcp-key.json
├── assessment.py
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── .env
```

---

© 2025 LicenceToScript
