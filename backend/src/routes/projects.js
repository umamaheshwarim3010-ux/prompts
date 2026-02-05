const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

// Get all projects for a user
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const projects = await prisma.project.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' }
        });

        res.json({
            success: true,
            projects
        });
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch projects'
        });
    }
});

// Create a new project
router.post('/', async (req, res) => {
    try {
        const { userId, name, path: projectPath, description } = req.body;

        if (!userId || !name || !projectPath) {
            return res.status(400).json({
                success: false,
                message: 'userId, name, and path are required'
            });
        }

        // Normalize the path
        const normalizedPath = path.normalize(projectPath).replace(/\\/g, '/');

        // Check if path exists
        if (!fs.existsSync(projectPath)) {
            return res.status(400).json({
                success: false,
                message: 'The specified path does not exist'
            });
        }

        // Check if project with same path already exists for this user
        const existingProject = await prisma.project.findFirst({
            where: {
                userId,
                path: normalizedPath
            }
        });

        if (existingProject) {
            return res.status(400).json({
                success: false,
                message: 'A project with this path already exists'
            });
        }

        // Deactivate all other projects for this user
        await prisma.project.updateMany({
            where: { userId },
            data: { isActive: false }
        });

        // Create new project and set it as active
        const project = await prisma.project.create({
            data: {
                userId,
                name,
                path: normalizedPath,
                description: description || '',
                isActive: true
            }
        });

        res.json({
            success: true,
            project
        });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create project'
        });
    }
});

// Set active project
router.put('/:projectId/activate', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required'
            });
        }

        // Get the project to verify ownership
        const project = await prisma.project.findUnique({
            where: { id: projectId }
        });

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        if (project.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        // Deactivate all projects for this user
        await prisma.project.updateMany({
            where: { userId },
            data: { isActive: false }
        });

        // Activate the selected project
        const updatedProject = await prisma.project.update({
            where: { id: projectId },
            data: { isActive: true }
        });

        res.json({
            success: true,
            project: updatedProject
        });
    } catch (error) {
        console.error('Error activating project:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to activate project'
        });
    }
});

// Get active project for a user
router.get('/user/:userId/active', async (req, res) => {
    try {
        const { userId } = req.params;

        const project = await prisma.project.findFirst({
            where: {
                userId,
                isActive: true
            }
        });

        res.json({
            success: true,
            project
        });
    } catch (error) {
        console.error('Error fetching active project:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active project'
        });
    }
});

// Update project
router.put('/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { name, description } = req.body;

        const project = await prisma.project.update({
            where: { id: projectId },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description })
            }
        });

        res.json({
            success: true,
            project
        });
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update project'
        });
    }
});

// Delete project
router.delete('/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;

        await prisma.project.delete({
            where: { id: projectId }
        });

        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete project'
        });
    }
});

// Browse directory (for folder selection)
router.get('/browse', async (req, res) => {
    try {
        const { path: dirPath } = req.query;
        const targetPath = dirPath || 'C:/';

        if (!fs.existsSync(targetPath)) {
            return res.status(400).json({
                success: false,
                message: 'Path does not exist'
            });
        }

        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({
                success: false,
                message: 'Path is not a directory'
            });
        }

        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        const directories = items
            .filter(item => item.isDirectory() && !item.name.startsWith('.'))
            .map(item => ({
                name: item.name,
                path: path.join(targetPath, item.name).replace(/\\/g, '/')
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({
            success: true,
            currentPath: targetPath.replace(/\\/g, '/'),
            parentPath: path.dirname(targetPath).replace(/\\/g, '/'),
            directories
        });
    } catch (error) {
        console.error('Error browsing directory:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to browse directory'
        });
    }
});

// Resolve folder path by name (search common directories)
router.post('/resolve-path', async (req, res) => {
    try {
        const { folderName, hintPaths } = req.body;

        if (!folderName) {
            return res.status(400).json({
                success: false,
                message: 'Folder name is required'
            });
        }

        // Common Windows directories to search
        const userProfile = process.env.USERPROFILE || 'C:/Users/Default';
        const searchPaths = [
            path.join(userProfile, 'Desktop'),
            path.join(userProfile, 'Documents'),
            path.join(userProfile, 'Downloads'),
            userProfile,
            'C:/',
            'D:/',
            ...(hintPaths || [])
        ];

        // Recursive function to search for folder
        const searchForFolder = (basePath, targetName, maxDepth = 3, currentDepth = 0) => {
            if (currentDepth > maxDepth) return null;

            try {
                if (!fs.existsSync(basePath)) return null;

                const stats = fs.statSync(basePath);
                if (!stats.isDirectory()) return null;

                const items = fs.readdirSync(basePath, { withFileTypes: true });

                // First, check direct children
                for (const item of items) {
                    if (item.isDirectory() && item.name === targetName) {
                        const fullPath = path.join(basePath, item.name);
                        return fullPath;
                    }
                }

                // If not found in direct children and we haven't reached max depth, search subdirectories
                if (currentDepth < maxDepth) {
                    for (const item of items) {
                        if (item.isDirectory() && !item.name.startsWith('.')) {
                            const subPath = path.join(basePath, item.name);
                            const result = searchForFolder(subPath, targetName, maxDepth, currentDepth + 1);
                            if (result) return result;
                        }
                    }
                }
            } catch (error) {
                // Skip directories we don't have permission to read
                return null;
            }

            return null;
        };

        // Search in all common paths
        let foundPath = null;
        for (const searchPath of searchPaths) {
            foundPath = searchForFolder(searchPath, folderName);
            if (foundPath) break;
        }

        if (foundPath) {
            res.json({
                success: true,
                absolutePath: foundPath.replace(/\\/g, '/')
            });
        } else {
            res.status(404).json({
                success: false,
                message: `Could not find folder "${folderName}" in common directories. Please enter the full path manually.`
            });
        }
    } catch (error) {
        console.error('Error resolving path:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resolve folder path'
        });
    }
});

module.exports = router;
