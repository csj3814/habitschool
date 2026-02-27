/**
 * data-manager.js
 * 데이터 처리 및 파일 업로드 유틸리티 모듈
 */

import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

/**
 * 객체를 깨끗하게 정리 (undefined → null 변환)
 */
export function sanitize(obj) {
    return JSON.parse(JSON.stringify(obj, (key, value) => value === undefined ? null : value));
}

/**
 * 이미지 파일을 압축하여 최적화
 * @param {File} file - 압축할 이미지 파일
 * @param {number} maxWidth - 최대 너비 (기본값: 1200px)
 * @param {number} maxHeight - 최대 높이 (기본값: 1200px)
 * @param {number} quality - JPEG 품질 (0.0-1.0, 기본값: 0.8)
 * @returns {Promise<File>} 압축된 파일 또는 원본 파일
 */
export async function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
    // 이미지 파일이 아니거나 이미 작은 파일은 그대로 반환
    if (!file.type.startsWith('image/')) return file;
    if (file.size < 200 * 1024) return file; // 200KB 미만은 압축 안 함

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 비율 유지하며 리사이징
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Canvas를 Blob으로 변환 (JPEG, quality 조절)
                canvas.toBlob((blob) => {
                    // 압축 후 파일이 더 크면 원본 반환
                    if (blob.size > file.size) {
                        resolve(file);
                    } else {
                        // Blob을 File 객체로 변환
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        console.log(`이미지 압축: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`);
                        resolve(compressedFile);
                    }
                }, 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

/**
 * 파일을 Firebase Storage에 업로드하고 URL 반환
 * 이미지 파일은 자동으로 압축됨
 * @param {File} file - 업로드할 파일
 * @param {string} folderName - 저장할 폴더 이름
 * @param {string} userId - 사용자 ID
 * @returns {Promise<string|null>} 업로드된 파일의 URL 또는 null
 */
export async function uploadFileAndGetUrl(file, folderName, userId) {
    if (!file) return null;
    
    try {
        // 이미지 파일이면 압축 후 업로드
        const fileToUpload = file.type.startsWith('image/') 
            ? await compressImage(file) 
            : file;
        
        const storageRef = ref(storage, `${folderName}/${userId}_${Date.now()}_${fileToUpload.name}`);
        await uploadBytes(storageRef, fileToUpload);
        return await getDownloadURL(storageRef);
    } catch(error) {
        console.error('파일 업로드 오류:', error);
        if (error.code === 'storage/unauthorized') {
            throw new Error('저장소 접근 권한이 없습니다. 로그인 상태를 확인해주세요.');
        }
        throw error;
    }
}

/**
 * 이미지 URL을 Base64 데이터 URL로 변환
 * 공유 카드 생성에 사용
 * @param {string} url - 변환할 이미지 URL
 * @returns {Promise<string>} Base64 데이터 URL
 */
export async function fetchImageAsBase64(url) {
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => {
                console.error('이미지 로드 실패:', url);
                resolve(url);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) { 
        console.error('Base64 변환 실패:', url, e);
        return url; 
    }
}
