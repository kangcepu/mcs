import { Router } from 'express';
import { authenticate } from '../auth.js';
import { asyncHandler, ok } from '../http.js';
import { getDashboard } from '../lib/dashboard.js';
import { getSubmoduleDashboard, listSubmoduleDashboards } from '../lib/submodule-dashboard.js';
import type { AuthRequest } from '../types.js';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const user = (req as AuthRequest).user!;
  const data = await getDashboard(user, {
    range: req.query.range as string | undefined,
    company: req.query.company as string | undefined,
    module: req.query.module as string | undefined,
  });
  ok(res, data);
}));

function dashboardDates(req:AuthRequest){
  const to=String(req.query.date_to??new Date().toISOString().slice(0,10));
  const fallback=new Date(`${to}T00:00:00`);fallback.setDate(fallback.getDate()-29);
  return {from:String(req.query.date_from??fallback.toISOString().slice(0,10)),to};
}

dashboardRouter.get('/dashboard/submodules',authenticate,asyncHandler(async(req,res)=>{
  const dates=dashboardDates(req as AuthRequest);
  const user=(req as AuthRequest).user!;
  ok(res,await listSubmoduleDashboards({...dates,group:String(req.query.group??''),status:String(req.query.status??''),search:String(req.query.search??''),company:String(req.query.company??'')||null,site:String(req.query.site??'')||null},user));
}));

dashboardRouter.get('/dashboard/submodules/:moduleCode',authenticate,asyncHandler(async(req,res)=>{
  const dates=dashboardDates(req as AuthRequest);const moduleCode=String(req.params.moduleCode??'').toUpperCase();
  const user=(req as AuthRequest).user!;
  ok(res,await getSubmoduleDashboard({...dates,moduleCode,company:String(req.query.company??'')||null,site:String(req.query.site??'')||null},user));
}));
