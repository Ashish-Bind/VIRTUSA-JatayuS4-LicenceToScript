import cv2
import numpy as np

# Load Haar cascade once
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

def extract_face_from_bytes(image_bytes):
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        print("Could not decode image.")
        return None

    faces = face_cascade.detectMultiScale(img, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60))
    if len(faces) == 0:
        print("No face detected.")
        return None

    x, y, w, h = faces[0]
    face = img[y:y+h, x:x+w]
    resized_face = cv2.resize(face, (200, 200))
    return resized_face

def compare_faces_from_files(img1_file, img2_file, threshold=70):
    img1_file.seek(0)
    img2_file.seek(0)

    face1 = extract_face_from_bytes(img1_file.read())
    face2 = extract_face_from_bytes(img2_file.read())

    if face1 is None or face2 is None:
        print("Face extraction failed.")
        return {
            "verified": False,
            "confidence": None
        }

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.train([face1], np.array([0]))
    label, confidence = recognizer.predict(face2)

    print("\n--- Face Comparison Result ---")
    print(f"Confidence: {confidence:.2f}")
    if confidence < threshold:
        print("✅ Faces Match")
    else:
        print("❌ Faces Do NOT Match")

    return {
        "verified": confidence < threshold,
        "confidence": float(round(confidence, 2))
    }